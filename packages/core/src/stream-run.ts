import { randomUUID } from "node:crypto";
import type { ResolvedAgent, RunSource } from "@platform/sdk";
import type { TraceStore, RunEvent } from "@platform/trace";
import type { Budget } from "@platform/gateway";
import type { Dispatch, RunResult } from "./dispatcher";

export type StreamEventName = "trace" | "token" | "done" | "error";

export interface StreamRunOpts {
  dispatch: Dispatch;
  trace: TraceStore;
  agent: ResolvedAgent;
  input: unknown;
  orgId: string;
  source: RunSource;
  budget: Budget;
  runId?: string;
  onEvent: (event: StreamEventName, data: unknown) => void;
}

function emitNewEvents(
  events: RunEvent[],
  fromIndex: number,
  onEvent: StreamRunOpts["onEvent"],
): number {
  for (let i = fromIndex; i < events.length; i++) {
    const e = events[i]!;
    onEvent("trace", e);
    if (e.type === "llm.token") {
      const text = (e.payload as { text?: string }).text;
      if (text) onEvent("token", { text, model: (e.payload as { model?: string }).model });
    }
  }
  return events.length;
}

/** Run agent and push trace/token events via callback (polled from TraceStore). */
export async function streamAgentRun(opts: StreamRunOpts): Promise<RunResult> {
  const runId = opts.runId ?? randomUUID();
  let lastCount = 0;
  const pollMs = 60;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const poll = async () => {
    const events = await opts.trace.list(runId);
    lastCount = emitNewEvents(events, lastCount, opts.onEvent);
  };

  pollTimer = setInterval(() => void poll(), pollMs);

  try {
    const result = await opts.dispatch({
      agent: opts.agent,
      input: opts.input,
      orgId: opts.orgId,
      source: opts.source,
      idempotencyKey: runId,
      budget: opts.budget,
    });
    await poll();
    opts.onEvent("done", result);
    return result;
  } catch (err) {
    await poll();
    opts.onEvent("error", { message: String(err) });
    throw err;
  } finally {
    if (pollTimer) clearInterval(pollTimer);
  }
}
