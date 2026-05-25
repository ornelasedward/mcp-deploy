import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Database } from "./index";
import { runEvents, runs } from "./schema";

export interface AuditExportOptions {
  orgId: string;
  since?: Date;
  until?: Date;
  /** Max runs to include (safety cap). */
  limit?: number;
}

export type AuditLine =
  | {
      kind: "run";
      runId: string;
      orgId: string;
      agentSlug: string | null;
      status: string;
      source: string;
      costUsd: number;
      tokens: number;
      durationMs: number | null;
      createdAt: string;
      input: unknown;
      output: unknown;
    }
  | {
      kind: "event";
      runId: string;
      eventId: string;
      type: string;
      ts: string;
      durationMs: number | null;
      payload: Record<string, unknown>;
    };

export function auditLineToJsonl(line: AuditLine): string {
  return JSON.stringify(line);
}

/** Append-only audit export for compliance / SIEM (runs + run_events). */
export async function exportAuditLog(
  db: Database,
  opts: AuditExportOptions,
): Promise<string> {
  const limit = opts.limit ?? 10_000;
  const conditions = [eq(runs.orgId, opts.orgId)];
  if (opts.since) conditions.push(gte(runs.createdAt, opts.since));
  if (opts.until) conditions.push(lte(runs.createdAt, opts.until));

  const runRows = await db
    .select()
    .from(runs)
    .where(and(...conditions))
    .orderBy(asc(runs.createdAt))
    .limit(limit);

  const lines: string[] = [];
  for (const row of runRows) {
    lines.push(
      auditLineToJsonl({
        kind: "run",
        runId: row.id,
        orgId: row.orgId,
        agentSlug: row.agentSlug,
        status: row.status,
        source: row.source,
        costUsd: row.costUsd,
        tokens: row.tokens,
        durationMs: row.durationMs,
        createdAt: row.createdAt.toISOString(),
        input: row.input,
        output: row.output,
      }),
    );

    const events = await db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, row.id))
      .orderBy(asc(runEvents.ts));

    for (const ev of events) {
      lines.push(
        auditLineToJsonl({
          kind: "event",
          runId: row.id,
          eventId: ev.id,
          type: ev.type,
          ts: ev.ts.toISOString(),
          durationMs: ev.durationMs,
          payload: ev.payload as Record<string, unknown>,
        }),
      );
    }
  }

  return lines.join("\n") + (lines.length ? "\n" : "");
}
