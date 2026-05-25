import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { CompleteRunPayload, RunEvent, RunRecord, TraceStore } from "@platform/trace";
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
        status: "running",
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

  async completeRun(payload: CompleteRunPayload): Promise<void> {
    await this.db
      .update(runs)
      .set({
        status: payload.status,
        output: payload.output ?? null,
        costUsd: payload.costUsd,
        durationMs: payload.durationMs,
      })
      .where(eq(runs.id, payload.runId));
  }
}
