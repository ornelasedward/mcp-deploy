/**
 * Runs an agent handler in a separate process. All ctx.llm/trace/tools go through the platform bridge.
 * Invoked by MockE2BRuntime (local subprocess) or inside an E2B sandbox.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createBridgeCtx } from "./bridge-client";

async function main() {
  const agentRoot = process.env.AGENT_ROOT;
  const bridgeUrl = process.env.BRIDGE_URL;
  const bridgeToken = process.env.BRIDGE_TOKEN;
  const runId = process.env.RUN_ID;
  const inputJson =
    process.env.INPUT_JSON ??
    (process.env.INPUT_FILE
      ? await import("node:fs/promises").then((fs) => fs.readFile(process.env.INPUT_FILE!, "utf8"))
      : undefined);

  if (!agentRoot || !bridgeUrl || !bridgeToken || !runId || !inputJson) {
    console.log(JSON.stringify({ ok: false, error: "missing env for isolated run" }));
    process.exit(1);
  }

  try {
    const mod = await import(pathToFileURL(resolve(agentRoot, "agent.config.ts")).href);
    const agent = mod.default;
    if (!agent?.handler) throw new Error("agent.config.ts must default-export defineAgent()");

    const input = agent.input.parse(JSON.parse(inputJson));
    const ctx = createBridgeCtx(runId, bridgeUrl, bridgeToken);
    const secretsJson =
      process.env.AGENT_SECRETS_JSON ??
      (process.env.AGENT_SECRETS_FILE
        ? await import("node:fs/promises").then((fs) =>
            fs.readFile(process.env.AGENT_SECRETS_FILE!, "utf8"),
          )
        : undefined);
    if (secretsJson) {
      const map = JSON.parse(secretsJson) as Record<string, string>;
      ctx.secrets = { async get(name) { return map[name]; } };
    }
    const output = await agent.handler(input, ctx);
    const parsed = agent.output.parse(output);
    console.log(JSON.stringify({ ok: true, output: parsed }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: String(err) }));
    process.exit(1);
  }
}

main();
