import { randomUUID } from "node:crypto";
import type { Ctx, Memory, ResolvedAgent, RunSource, ToolHost } from "@platform/sdk";
import { makeEmitter, type TraceStore } from "@platform/trace";
import type { Gateway, Budget } from "@platform/gateway";
import type { LlmUsage } from "@platform/sdk";
import type { BridgeRegistry, Runtime } from "@platform/runtime";
import { parseEgressAllowlist } from "@platform/runtime";
import type { DurableEngine, StepApi } from "@platform/durable";

export interface DispatchRequest<I = unknown> {
  agent: ResolvedAgent<I, unknown>;
  input: I;
  source: RunSource;
  orgId: string;
  idempotencyKey?: string;
  budget: Budget;
  /** Load encrypted project secrets into ctx (never traced). */
  projectId?: string;
  /** Deployment artifact path for E2B snapshot hydration. */
  snapshotRef?: string;
}

export interface RunResult<O = unknown> {
  runId: string;
  status: "succeeded" | "failed";
  output?: O;
  error?: string;
  costUsd: number;
  durationMs: number;
}

export interface DispatcherDeps {
  runtime: Runtime;
  durable: DurableEngine;
  gateway: Gateway;
  trace: TraceStore;
  /** Persist LLM usage per call (usage_events in prod). */
  onUsage?: (opts: { runId: string; orgId: string; usage: LlmUsage }) => void | Promise<void>;
  loadSecrets?: (projectId: string) => Promise<Record<string, string>>;
  /** Persist the run row (and enforce idempotency at the data layer in prod). */
  onRunComplete?: (r: RunResult & { source: RunSource; orgId: string }) => void | Promise<void>;
  bridgeRegistry?: BridgeRegistry;
  defaultEgressAllowlist?: string[];
}

function makeMemory(): Memory {
  const store = new Map<string, unknown>();
  return {
    async get(k) { return store.get(k) as any; },
    async set(k, v) { store.set(k, v); },
  };
}

const noopTools: ToolHost = {
  async call() { throw new Error("No tools registered for this agent"); },
};

/**
 * The single entry point ALL surfaces (http, mcp, cli, playground, eval) funnel through.
 * Normalizes the request, wraps it in a durable workflow, builds a per-run Ctx (gateway +
 * trace + memory), runs it in the isolated runtime, and records cost + source.
 */
export interface DispatchOptions {
  /** Inngest workflow step — enables ctx.step.waitForEvent (HITL). */
  durable?: DurableEngine;
}

export function createDispatcher(deps: DispatcherDeps) {
  return async function dispatch<I, O>(
    req: DispatchRequest<I>,
    options?: DispatchOptions,
  ): Promise<RunResult<O>> {
    const runId = req.idempotencyKey ?? randomUUID();
    const started = Date.now();
    let costUsd = 0;

    const trace = makeEmitter(deps.trace, runId);
    const llm = deps.gateway.forRun({
      runId,
      orgId: req.orgId,
      budget: req.budget,
      trace,
      onUsage: async (u) => {
        costUsd += u.costUsd;
        await deps.onUsage?.({ runId, orgId: req.orgId, usage: u });
      },
    });

    let secretsMap: Record<string, string> | undefined;
    if (req.projectId && deps.loadSecrets) {
      secretsMap = await deps.loadSecrets(req.projectId);
    }

    const ctx: Ctx = {
      runId,
      llm,
      trace,
      memory: makeMemory(),
      tools: noopTools,
      signal: AbortSignal.timeout(120_000),
      secrets: secretsMap
        ? {
            async get(name) {
              return secretsMap![name];
            },
          }
        : undefined,
    };

    await deps.trace.beginRun?.({
      runId,
      orgId: req.orgId,
      source: req.source,
      agentSlug: req.agent.slug,
      input: req.input,
    });

    trace.event("run.start", { agent: req.agent.slug, source: req.source });

    const egressAllowlist =
      deps.defaultEgressAllowlist ?? parseEgressAllowlist();
    if (deps.bridgeRegistry) {
      deps.bridgeRegistry.register({ runId, orgId: req.orgId, ctx, egressAllowlist });
    }

    const durable = options?.durable ?? deps.durable;

    function attachStep(step: StepApi) {
      ctx.step = {
        waitForEvent: async (name, wopts) => {
          await deps.trace.updateRunStatus?.(runId, "suspended", { pendingEvent: name });
          trace.event("run.suspended", { event: name });
          try {
            const data = await step.waitForEvent(name, wopts);
            await deps.trace.updateRunStatus?.(runId, "running");
            trace.event("run.resumed", { event: name });
            return data;
          } catch (err) {
            await deps.trace.updateRunStatus?.(runId, "failed", { error: String(err) });
            throw err;
          }
        },
      };
    }

    try {
      const output = await durable.execute(
        { workflow: "run", id: runId },
        async (step) => {
          attachStep(step);
          return step.run("execute", () =>
            deps.runtime.execute<I, O>({
              agent: req.agent as ResolvedAgent<I, O>,
              input: req.input,
              ctx,
              meta: {
                orgId: req.orgId,
                snapshotRef: req.snapshotRef,
                egressAllowlist,
                secrets: secretsMap,
              },
            }),
          );
        },
      );
      const result: RunResult<O> = {
        runId, status: "succeeded", output, costUsd, durationMs: Date.now() - started,
      };
      trace.event("run.succeeded", { costUsd });
      await deps.onRunComplete?.({ ...result, source: req.source, orgId: req.orgId });
      return result;
    } catch (err) {
      const result: RunResult<O> = {
        runId, status: "failed", error: String(err), costUsd, durationMs: Date.now() - started,
      };
      trace.event("run.failed", { error: String(err) });
      await deps.onRunComplete?.({ ...result, source: req.source, orgId: req.orgId });
      return result;
    } finally {
      deps.bridgeRegistry?.unregister(runId);
    }
  };
}

export type Dispatch = ReturnType<typeof createDispatcher>;
