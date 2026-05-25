import Link from "next/link";
import { apiFetch, devOrgId } from "../../../../../../../lib/api-server";
import { formatDuration, formatTime, formatUsd } from "../../../../../../../lib/format";
import { TraceTimeline } from "../../../../../../../components/trace-timeline";
import { HitlApprove } from "../../../../../../../components/hitl-approve";

export default async function RunTracePage({
  params,
}: {
  params: Promise<{ id: string; slug: string; runId: string }>;
}) {
  const { id: projectId, slug, runId } = await params;
  const orgId = devOrgId();

  const res = await apiFetch(
    `/v1/orgs/${orgId}/projects/${projectId}/agents/${slug}/runs/${runId}`,
  );
  if (!res.ok) {
    return (
      <main>
        <h1>Run not found</h1>
        <Link href={`/projects/${projectId}/agents/${slug}`}>← Agent</Link>
      </main>
    );
  }

  const { run, events } = (await res.json()) as {
    run: {
      id: string;
      status: string;
      source: string;
      costUsd: number;
      durationMs: number | null;
      createdAt: string;
      input: unknown;
      output: unknown;
      pendingEvent?: string;
    };
    events: { type: string; payload: Record<string, unknown>; durationMs?: number }[];
  };

  const suspendedEvent =
    run.pendingEvent ??
    (events.find((e) => e.type === "run.suspended")?.payload as { event?: string } | undefined)
      ?.event;

  return (
    <main>
      <p style={{ fontSize: 14, color: "#666" }}>
        <Link href="/dashboard">Dashboard</Link> /{" "}
        <Link href={`/projects/${projectId}/agents/${slug}`}>{slug}</Link> / run
      </p>
      <h1 style={{ marginTop: 8 }}>Run {run.id.slice(0, 8)}…</h1>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginTop: 12,
          fontSize: 14,
          color: "#444",
        }}
      >
        <span>
          Status:{" "}
          <strong style={{ color: run.status === "failed" ? "#dc2626" : "#16a34a" }}>
            {run.status}
          </strong>
        </span>
        <span>Source: {run.source}</span>
        <span>Cost: {formatUsd(Number(run.costUsd))}</span>
        <span>Duration: {formatDuration(run.durationMs)}</span>
        <span>{formatTime(run.createdAt)}</span>
      </div>

      {run.status === "suspended" && (
        <HitlApprove orgId={orgId} slug={slug} runId={runId} eventName={suspendedEvent} />
      )}

      {(run.input != null || run.output != null) && (
        <section style={{ marginTop: 24, display: "grid", gap: 16 }}>
          {run.input != null && (
            <div>
              <h3>Input</h3>
              <pre style={{ background: "#f4f4f5", padding: 12, fontSize: 12, overflow: "auto" }}>
                {JSON.stringify(run.input, null, 2)}
              </pre>
            </div>
          )}
          {run.output != null && (
            <div>
              <h3>Output</h3>
              <pre style={{ background: "#f4f4f5", padding: 12, fontSize: 12, overflow: "auto" }}>
                {JSON.stringify(run.output, null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}

      <section style={{ marginTop: 32 }}>
        <h2>Trace replay</h2>
        <TraceTimeline events={events} />
      </section>
    </main>
  );
}
