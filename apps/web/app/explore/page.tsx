import Link from "next/link";
import { apiFetch } from "../../lib/api-server";

type DirectoryAgent = {
  slug: string;
  name: string;
  description?: string;
  playgroundUrl: string;
  mcpUrl: string;
  projectId?: string;
};

export default async function ExplorePage() {
  const res = await apiFetch("/v1/public/directory", { next: { revalidate: 30 } });
  const agents: DirectoryAgent[] = res.ok
    ? ((await res.json()) as { agents: DirectoryAgent[] }).agents
    : [];

  return (
    <main>
      <h1>Explore agents</h1>
      <p style={{ color: "#666", maxWidth: 560 }}>
        Public agents opted in with MCP enabled. Add any agent to Claude Desktop in one click, or
        open the playground.
      </p>
      <p style={{ marginTop: 12, fontSize: 14 }}>
        <Link href="/">Home</Link> · <Link href="/dashboard">Dashboard</Link>
      </p>

      {agents.length === 0 ? (
        <p style={{ marginTop: 24 }}>
          No public MCP agents yet. Set <code>public: true</code> on an agent manifest and enable
          the MCP surface.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 28 }}>
          {agents.map((a) => (
            <li
              key={a.slug}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{a.name}</h2>
                  <p style={{ margin: "6px 0 0", color: "#666" }}>{a.description ?? a.slug}</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Link
                    href={`/add/claude/${a.slug}`}
                    style={{
                      padding: "8px 14px",
                      background: "#d97706",
                      color: "#fff",
                      borderRadius: 6,
                      textDecoration: "none",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Add to Claude
                  </Link>
                  <Link
                    href={`/a/${a.slug}`}
                    style={{
                      padding: "8px 14px",
                      border: "1px solid #d4d4d8",
                      borderRadius: 6,
                      fontSize: 14,
                    }}
                  >
                    Playground
                  </Link>
                </div>
              </div>
              <p style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
                MCP: <code>{a.mcpUrl}</code>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
