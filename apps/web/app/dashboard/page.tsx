import Link from "next/link";
import { apiFetch, devOrgId } from "../../lib/api";
import { hasClerk } from "../../lib/clerk";
import { formatPct, formatUsd, formatTime } from "../../lib/format";

type Project = { id: string; repo: string; framework: string | null };
type Agent = {
  slug: string;
  name: string;
  surfaces: string[];
  projectId?: string;
  stats?: { runCount: number; errorRate: number; avgCostUsd: number };
  lastDeploy?: {
    status: string;
    commitSha: string;
    createdAt: string;
    isPreview: boolean;
    prNumber: number | null;
  };
};
type ApiKey = { id: string; name: string; keyPrefix: string; role: string };

export default async function DashboardPage() {
  const orgId = devOrgId();

  if (hasClerk) {
    await apiFetch("/v1/me/sync", {
      method: "POST",
      body: JSON.stringify({ orgId }),
    });
  }

  const [projectsRes, agentsRes, keysRes, overviewRes] = await Promise.all([
    apiFetch(`/v1/orgs/${orgId}/projects`),
    apiFetch("/v1/agents"),
    apiFetch(`/v1/orgs/${orgId}/api-keys`).catch(() => null),
    apiFetch(`/v1/orgs/${orgId}/overview`).catch(() => null),
  ]);

  const projects: Project[] = projectsRes.ok
    ? ((await projectsRes.json()) as { projects: Project[] }).projects
    : [];
  const agents: Agent[] = agentsRes.ok
    ? ((await agentsRes.json()) as { agents: Agent[] }).agents
    : [];
  const keys: ApiKey[] =
    keysRes?.ok ? ((await keysRes.json()) as { keys: ApiKey[] }).keys : [];
  const usage = overviewRes?.ok
    ? (
        await overviewRes.json() as {
          usage?: {
            spentUsd: number;
            monthlyCapUsd: number;
            remainingUsd: number;
            hardStop: boolean;
          };
        }
      ).usage
    : undefined;

  return (
    <main>
      <h1>Dashboard</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Org <code>{orgId}</code>
        {!hasClerk && " · dev mode (set Clerk keys for sign-in)"}
      </p>

      {usage && (
        <section
          style={{
            marginTop: 20,
            padding: 16,
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            maxWidth: 420,
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Spend this month</h2>
          <p style={{ margin: 0, fontSize: 15 }}>
            {formatUsd(usage.spentUsd)} / {formatUsd(usage.monthlyCapUsd)}
            <span style={{ color: "#666", marginLeft: 8 }}>
              ({formatUsd(usage.remainingUsd)} left
              {usage.hardStop ? ", hard stop" : ", soft cap"})
            </span>
          </p>
        </section>
      )}

      <section style={{ marginTop: 28 }}>
        <h2>Agents</h2>
        {agents.length === 0 ? (
          <p>No agents in this org. Deploy with <code>pnpm deploy:local</code>.</p>
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
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    {a.projectId ? (
                      <Link
                        href={`/projects/${a.projectId}/agents/${a.slug}`}
                        style={{ fontSize: 18, fontWeight: 600 }}
                      >
                        {a.name}
                      </Link>
                    ) : (
                      <Link href={`/a/${a.slug}`} style={{ fontSize: 18, fontWeight: 600 }}>
                        {a.name}
                      </Link>
                    )}
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                      {a.surfaces.join(" · ")}
                    </p>
                  </div>
                  {a.stats && (
                    <div style={{ fontSize: 13, color: "#444", textAlign: "right" }}>
                      <div>{a.stats.runCount} runs</div>
                      <div>{formatUsd(a.stats.avgCostUsd)} avg</div>
                      <div>{formatPct(a.stats.errorRate)} errors</div>
                    </div>
                  )}
                </div>
                {a.lastDeploy && (
                  <p style={{ marginTop: 8, fontSize: 12, color: "#71717a" }}>
                    Last deploy: {a.lastDeploy.status} ·{" "}
                    <code>{a.lastDeploy.commitSha.slice(0, 7)}</code> ·{" "}
                    {formatTime(a.lastDeploy.createdAt)}
                    {a.lastDeploy.isPreview && a.lastDeploy.prNumber != null
                      ? ` · PR #${a.lastDeploy.prNumber}`
                      : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Projects</h2>
        {projects.length === 0 ? (
          <p>No projects yet. Link a GitHub repo via API or deploy from local path.</p>
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.id} style={{ marginBottom: 6 }}>
                <code>{p.repo}</code>
                {p.framework ? ` · ${p.framework}` : ""}
                <span style={{ color: "#888", marginLeft: 8, fontSize: 12 }}>
                  id: {p.id.slice(0, 8)}…
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>API keys</h2>
        {keys.length === 0 ? (
          <p>
            Create keys with{" "}
            <code>POST /v1/orgs/{orgId}/api-keys</code> (owner role).
          </p>
        ) : (
          <ul>
            {keys.map((k) => (
              <li key={k.id}>
                {k.name} · <code>{k.keyPrefix}…</code> · {k.role}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: 32 }}>
        <Link href="/">← Home</Link>
      </p>
    </main>
  );
}
