import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export interface IsolatedRunOpts {
  agentRoot: string;
  input: unknown;
  runId: string;
  bridgeUrl: string;
  bridgeToken: string;
  secrets?: Record<string, string>;
  /** Monorepo root so subprocess resolves workspace deps (tsx, @platform/sdk). */
  cwd?: string;
}

const ISOLATED_RUN = fileURLToPath(new URL("./isolated-run.ts", import.meta.url));

/** Spawn isolated runner process; handler never executes in caller process. */
export async function runIsolatedAgent(opts: IsolatedRunOpts): Promise<unknown> {
  const cwd = opts.cwd ?? process.cwd();
  const env = {
    ...process.env,
    AGENT_ROOT: resolve(opts.agentRoot),
    BRIDGE_URL: opts.bridgeUrl,
    BRIDGE_TOKEN: opts.bridgeToken,
    RUN_ID: opts.runId,
    INPUT_JSON: JSON.stringify(opts.input),
    ...(opts.secrets && Object.keys(opts.secrets).length > 0
      ? { AGENT_SECRETS_JSON: JSON.stringify(opts.secrets) }
      : {}),
  };

  return new Promise((resolvePromise, reject) => {
    const proc = spawn("pnpm", ["exec", "tsx", ISOLATED_RUN], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      const line = stdout.trim().split("\n").filter(Boolean).pop();
      if (!line) {
        reject(new Error(stderr || `isolated run exited ${code}`));
        return;
      }
      try {
        const json = JSON.parse(line) as { ok: boolean; output?: unknown; error?: string };
        if (json.ok) resolvePromise(json.output);
        else reject(new Error(json.error ?? "isolated run failed"));
      } catch (err) {
        reject(new Error(`invalid isolated output: ${line}\n${stderr}`));
      }
    });
  });
}
