import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ExecuteOptions } from "./types";
import { uploadSnapshotToSandbox } from "./upload-snapshot";

export interface E2BRuntimeOptions {
  apiKey: string;
  bridgeUrl: string;
  bridgeToken: string;
  templateId?: string;
}

/** Production: Firecracker microVM via E2B; handler runs in sandbox, ctx bridged to platform. */
export class E2BRuntime {
  constructor(private opts: E2BRuntimeOptions) {}

  async execute<I, O>({ agent, input, ctx, meta }: ExecuteOptions<I, O>): Promise<O> {
    const snapshotRef = meta?.snapshotRef;
    if (!snapshotRef) {
      throw new Error("E2BRuntime requires meta.snapshotRef from deployment artifact");
    }

    const { Sandbox } = await import("e2b");
    const sandbox = await Sandbox.create({
      apiKey: this.opts.apiKey,
      template: this.opts.templateId,
      timeoutMs: 120_000,
    });

    try {
      ctx.trace.event("runtime.sandbox", {
        provider: "e2b",
        agent: agent.slug,
        sandboxId: sandbox.sandboxId,
      });

      await uploadSnapshotToSandbox(
        {
          write: (path, data) => sandbox.files.write(path, data),
        },
        snapshotRef,
        "/agent",
      );

      const runnerFiles = ["isolated-run.ts", "bridge-client.ts"];
      for (const file of runnerFiles) {
        const src = fileURLToPath(new URL(`./${file}`, import.meta.url));
        const content = await readFile(src, "utf8");
        await sandbox.files.write(`/platform/runtime/${file}`, content);
      }

      await sandbox.files.write("/agent/input.json", JSON.stringify(input));
      if (meta?.secrets && Object.keys(meta.secrets).length > 0) {
        await sandbox.files.write("/agent/secrets.json", JSON.stringify(meta.secrets));
      }

      const cmd = [
        `export BRIDGE_URL="${this.opts.bridgeUrl}"`,
        `export BRIDGE_TOKEN="${this.opts.bridgeToken}"`,
        `export RUN_ID="${ctx.runId}"`,
        `export AGENT_ROOT="/agent"`,
        `export INPUT_FILE="/agent/input.json"`,
        ...(meta?.secrets && Object.keys(meta.secrets).length > 0
          ? [`export AGENT_SECRETS_FILE="/agent/secrets.json"`]
          : []),
        `cd /agent && npx -y tsx /platform/runtime/isolated-run.ts`,
      ].join(" && ");

      const result = await sandbox.commands.run(cmd, { timeoutMs: 120_000 });
      const line = result.stdout.trim().split("\n").filter(Boolean).pop();
      if (!line) throw new Error(result.stderr || "E2B run produced no output");

      const json = JSON.parse(line) as { ok: boolean; output?: unknown; error?: string };
      if (!json.ok) throw new Error(json.error ?? "E2B handler failed");
      return agent.output.parse(json.output);
    } finally {
      await sandbox.kill();
    }
  }
}
