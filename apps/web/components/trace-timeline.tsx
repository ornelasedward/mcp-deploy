export type TraceEvent = {
  id?: string;
  type: string;
  payload: Record<string, unknown>;
  ts?: number;
  durationMs?: number;
};

export function TraceTimeline({ events }: { events: TraceEvent[] }) {
  if (events.length === 0) {
    return <p style={{ color: "#666" }}>No trace events recorded.</p>;
  }

  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {events.map((e, i) => (
        <li
          key={e.id ?? i}
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 0,
            paddingBottom: 20,
            position: "relative",
          }}
        >
          <div style={{ width: 12, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: e.type.includes("failed") || e.type.includes("error") ? "#ef4444" : "#3b82f6",
                marginTop: 4,
              }}
            />
            {i < events.length - 1 && (
              <div style={{ width: 2, flex: 1, background: "#e4e4e7", marginTop: 4, minHeight: 24 }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong>{e.type}</strong>
              {e.durationMs != null && (
                <span style={{ fontSize: 12, color: "#71717a" }}>{e.durationMs}ms</span>
              )}
            </div>
            <pre
              style={{
                fontSize: 12,
                margin: "6px 0 0",
                background: "#fafafa",
                border: "1px solid #f4f4f5",
                borderRadius: 6,
                padding: 8,
                overflow: "auto",
                maxHeight: 200,
              }}
            >
              {JSON.stringify(e.payload, null, 2)}
            </pre>
          </div>
        </li>
      ))}
    </ol>
  );
}
