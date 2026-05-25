import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type {
  CompleteRunPayload,
  RunEvent,
  RunRecord,
  RunSnapshot,
  RunStatus,
  TraceStore,
} from "@platform/trace";
import * as schema from "./schema";
import { orgs, runEvents, runs } from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Drizzle-backed append-only trace store. Persists `runs` + `run_events` in Postgres.
 * Secrets are redacted upstream by `makeEmitter` before append.
 */
export class PostgresTraceStore implements TraceStore {
  constructor(private db: Database) {}

  async beginRun(record: RunRecord): Promise<void> {
    await this.db
      .insert(orgs)
      .values({ id: record.orgId, name: record.orgId })
      .onConflictDoNothing();

    await this.db
      .insert(runs)
      .values({
        id: record.runId,
        orgId: record.orgId,
        agentId: record.agentId ?? null,
        agentSlug: record.agentSlug ?? null,
        input: record.input ?? null,
        status: record.status ?? "running",
        source: record.source,
        idempotencyKey: record.runId,
      })
      .onConflictDoNothing();
  }

  async append(event: RunEvent): Promise<void> {
    await this.db.insert(runEvents).values({
      id: event.id,
      runId: event.runId,
      parentId: event.parentId ?? null,
      type: event.type,
      payload: event.payload,
      durationMs: event.durationMs ?? null,
      ts: new Date(event.ts),
    });
  }

  async list(runId: string): Promise<RunEvent[]> {
    const rows = await this.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(asc(runEvents.ts));

    return rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      parentId: row.parentId ?? undefined,
      type: row.type,
      payload: row.payload as Record<string, unknown>,
      ts: row.ts.getTime(),
      durationMs: row.durationMs ?? undefined,
    }));
  }

  async getRun(runId: string): Promise<RunSnapshot | null> {
    const rows = await this.db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      runId: row.id,
      orgId: row.orgId,
      source: row.source,
      status: row.status as RunStatus,
      agentSlug: row.agentSlug ?? undefined,
      input: row.input ?? undefined,
      output: row.output ?? undefined,
      costUsd: row.costUsd,
      durationMs: row.durationMs ?? undefined,
      createdAt: row.createdAt.getTime(),
    };
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    extra?: { pendingEvent?: string; error?: string },
  ): Promise<void> {
    await this.db
      .update(runs)
      .set({
        status,
        ...(extra?.error != null ? { output: { error: extra.error } } : {}),
      })
      .where(eq(runs.id, runId));
    if (extra?.pendingEvent) {
      await this.append({
        id: randomUUID(),
        runId,
        type: "run.suspended",
        payload: { event: extra.pendingEvent },
        ts: Date.now(),
      });
    }
  }

  async completeRun(payload: CompleteRunPayload): Promise<void> {
    await this.db
      .update(runs)
      .set({
        status: payload.status,
        output: payload.output ?? (payload.error ? { error: payload.error } : null),
        costUsd: payload.costUsd,
        durationMs: payload.durationMs,
      })
      .where(eq(runs.id, payload.runId));
  }
}
