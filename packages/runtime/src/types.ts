import type { Ctx, ResolvedAgent } from "@platform/sdk";

export interface RuntimeExecuteMeta {
  orgId: string;
  snapshotRef?: string;
  agentRoot?: string;
  egressAllowlist?: string[];
  /** Injected into isolated sandbox env (never logged). */
  secrets?: Record<string, string>;
}

export interface ExecuteOptions<I, O> {
  agent: ResolvedAgent<I, O>;
  input: I;
  ctx: Ctx;
  meta?: RuntimeExecuteMeta;
}

export interface Runtime {
  execute<I, O>(opts: ExecuteOptions<I, O>): Promise<O>;
}
