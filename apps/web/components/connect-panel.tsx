import { CopyButton } from "./copy-button";

export function ConnectPanel({
  surfaces,
  snippets,
}: {
  surfaces?: string[];
  snippets?: Record<string, string>;
}) {
  if (!snippets || Object.keys(snippets).length === 0) return null;

  return (
    <section style={{ marginTop: 28 }}>
      <h2>Connect</h2>
      {surfaces && (
        <p style={{ color: "#666", fontSize: 14 }}>Surfaces: {surfaces.join(" · ")}</p>
      )}
      {Object.entries(snippets).map(([name, snippet]) => (
        <div
          key={name}
          style={{
            marginTop: 16,
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ textTransform: "uppercase", fontSize: 12 }}>{name}</strong>
            <CopyButton text={snippet} />
          </div>
          <pre
            style={{
              marginTop: 8,
              background: "#f4f4f5",
              padding: 10,
              fontSize: 12,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {snippet}
          </pre>
        </div>
      ))}
    </section>
  );
}
