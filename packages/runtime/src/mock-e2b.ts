import type { Ctx, ResolvedAgent } from "@platform/sdk";
import type { ExecuteOptions } from "./types";
import { runIsolatedAgent } from "./isolated-executor";

export interface MockE2BOptions {
  bridgeUrl: string;
  bridgeToken: string;
  repoRoot?: string;
}

/** CI/local: separate OS process + HTTP bridge — handler not in API process. */
export class MockE2BRuntime {
  constructor(private opts: MockE2BOptions) {}

  async execute<I, O>({ agent, input, ctx, meta }: ExecuteOptions<I, O>): Promise<O> {
    const agentRoot = meta?.snapshotRef ?? meta?.agentRoot;
    if (!agentRoot) {
      throw new Error("MockE2BRuntime requires meta.snapshotRef (artifact path)");
    }

    ctx.trace.event("runtime.sandbox", {
      provider: "e2b-mock",
      agent: agent.slug,
      isolated: true,
    });

    const output = await runIsolatedAgent({
      agentRoot,
      input,
      runId: ctx.runId,
      bridgeUrl: this.opts.bridgeUrl,
      bridgeToken: this.opts.bridgeToken,
      cwd: this.opts.repoRoot,
      secrets: meta?.secrets,
    });

    return agent.output.parse(output);
  }
}
