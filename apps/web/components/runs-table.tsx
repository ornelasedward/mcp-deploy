import Link from "next/link";
import { formatDuration, formatTime, formatUsd } from "../lib/format";

export type RunListItem = {
  id: string;
  status: string;
  source: string;
  costUsd: number;
  durationMs: number | null;
  createdAt: string | Date;
};

export function RunsTable({
  runs,
  projectId,
  slug,
}: {
  runs: RunListItem[];
  projectId: string;
  slug: string;
}) {
  if (runs.length === 0) {
    return <p style={{ color: "#666" }}>No runs yet. Use the playground or API to trigger one.</p>;
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #e4e4e7", textAlign: "left" }}>
          <th style={{ padding: "8px 4px" }}>Status</th>
          <th style={{ padding: "8px 4px" }}>Source</th>
          <th style={{ padding: "8px 4px" }}>Cost</th>
          <th style={{ padding: "8px 4px" }}>Duration</th>
          <th style={{ padding: "8px 4px" }}>When</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
            <td style={{ padding: "10px 4px" }}>
              <Link
                href={`/projects/${projectId}/agents/${slug}/runs/${r.id}`}
                style={{
                  color: r.status === "failed" ? "#dc2626" : r.status === "succeeded" ? "#16a34a" : "#333",
                  fontWeight: 500,
                }}
              >
                {r.status}
              </Link>
            </td>
            <td style={{ padding: "10px 4px", color: "#666" }}>{r.source}</td>
            <td style={{ padding: "10px 4px" }}>{formatUsd(Number(r.costUsd))}</td>
            <td style={{ padding: "10px 4px" }}>{formatDuration(r.durationMs)}</td>
            <td style={{ padding: "10px 4px", color: "#666" }}>{formatTime(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
