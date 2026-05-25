import type { TraceEmitter } from "@platform/sdk";
import { randomUUID } from "node:crypto";

export interface RunEvent {
  id: string;
  runId: string;
  parentId?: string;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
  durationMs?: number;
}

/** Metadata recorded when a run starts (Postgres backend upserts `runs`). */
export interface RunRecord {
  runId: string;
  orgId: string;
  source: string;
  agentSlug?: string;
  agentId?: string;
  input?: unknown;
}

/** Final run row update after dispatch completes. */
export interface CompleteRunPayload {
  runId: string;
  orgId: string;
  source: string;
  status: "succeeded" | "failed";
  output?: unknown;
  error?: string;
  costUsd: number;
  durationMs: number;
}

/** Append-only event log. The source of truth for trace replay; events are never mutated. */
export interface TraceStore {
  append(event: RunEvent): Promise<void>;
  list(runId: string): Promise<RunEvent[]>;
  /** Upsert run row before events are written (implemented by PostgresTraceStore). */
  beginRun?(record: RunRecord): Promise<void>;
  /** Finalize run row after dispatch completes (implemented by PostgresTraceStore). */
  completeRun?(payload: CompleteRunPayload): Promise<void>;
}

const SECRET_KEYS = /(authorization|api[_-]?key|password|secret|token)/i;
function redact(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

export class InMemoryTraceStore implements TraceStore {
  private events: RunEvent[] = [];
  async append(event: RunEvent): Promise<void> {
    this.events.push(event);
  }
  async list(runId: string): Promise<RunEvent[]> {
    return this.events.filter((e) => e.runId === runId).sort((a, b) => a.ts - b.ts);
  }
}

/** Builds a per-run emitter that writes redacted spans into the store. */
export function makeEmitter(store: TraceStore, runId: string, parentId?: string): TraceEmitter {
  const write = (type: string, payload: Record<string, unknown>, durationMs?: number) =>
    store.append({
      id: randomUUID(),
      runId,
      parentId,
      type,
      payload: redact(payload),
      ts: Date.now(),
      durationMs,
    });

  return {
    event(type, payload) {
      void write(type, payload);
    },
    async span(type, payload, fn) {
      const start = Date.now();
      try {
        const result = await fn();
        await write(type, payload, Date.now() - start);
        return result;
      } catch (err) {
        await write(`${type}.error`, { ...payload, error: String(err) }, Date.now() - start);
        throw err;
      }
    },
  };
}
