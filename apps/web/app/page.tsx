import Link from "next/link";
import { apiFetch } from "../lib/api";
import { hasClerk } from "../lib/clerk";

async function fetchAgents() {
  try {
    const r = await apiFetch("/v1/agents", { next: { revalidate: 10 } });
    if (!r.ok) return [];
    const body = await r.json();
    return body.agents as { slug: string; name: string; description?: string; surfaces: string[] }[];
  } catch {
    return [];
  }
}

export default async function Home() {
  const agents = await fetchAgents();

  return (
    <main>
      <h1>agentd</h1>
      <p>One push → endpoint + MCP + CLI + playground. The deployed agent is the shareable artifact.</p>
      <p style={{ marginTop: 12 }}>
        <Link href="/dashboard">Dashboard</Link>
        {hasClerk && (
          <>
            {" · "}
            <Link href="/sign-in">Sign in</Link>
          </>
        )}
      </p>

      <section style={{ marginTop: 32 }}>
        <h2>Deployed agents</h2>
        {agents.length === 0 ? (
          <p>
            No agents yet. Start the API (<code>pnpm api</code>) or run{" "}
            <code>pnpm deploy:local</code>.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {agents.map((a) => (
              <li
                key={a.slug}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <a
                  href={
                    (a as { projectId?: string }).projectId
                      ? `/projects/${(a as { projectId?: string }).projectId}/agents/${a.slug}`
                      : `/a/${a.slug}`
                  }
                  style={{ fontSize: 18, fontWeight: 600 }}
                >
                  {a.name}
                </a>
                <p style={{ margin: "4px 0", color: "#666" }}>{a.description ?? a.slug}</p>
                <p style={{ fontSize: 13 }}>
                  Surfaces: {a.surfaces.join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: 24, fontSize: 14, color: "#666" }}>
        Example: <a href="/a/support-triage">/a/support-triage</a>
      </p>
    </main>
  );
}
