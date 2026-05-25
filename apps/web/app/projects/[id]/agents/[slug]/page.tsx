import Link from "next/link";
import { apiFetch, devOrgId } from "../../../../../lib/api";
import { formatPct, formatUsd } from "../../../../../lib/format";
import { ConnectPanel } from "../../../../../components/connect-panel";
import { RunsTable } from "../../../../../components/runs-table";
import { SurfaceToggles } from "../../../../../components/surface-toggles";

type AgentDetail = {
  agent: {
    id: string;
    slug: string;
    name: string;
    projectId: string;
    repo: string;
    surfaces: string[];
    public?: boolean;
  };
  stats: { runCount: number; failedCount: number; errorRate: number; avgCostUsd: number };
  lastDeploy: {
    id: string;
    status: string;
    commitSha: string;
    createdAt: string;
    isPreview: boolean;
    prNumber: number | null;
  } | null;
  recentRuns: {
    id: string;
    status: string;
    source: string;
    costUsd: number;
    durationMs: number | null;
    createdAt: string;
  }[];
  connect: { surfaces: string[]; snippets: Record<string, string> };
};

export default async function AgentDashboardPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id: projectId, slug } = await params;
  const orgId = devOrgId();

  const res = await apiFetch(`/v1/orgs/${orgId}/projects/${projectId}/agents/${slug}`);
  if (!res.ok) {
    return (
      <main>
        <h1>Agent not found</h1>
        <p>Deploy the agent or check the project id.</p>
        <Link href="/dashboard">← Dashboard</Link>
      </main>
    );
  }

  const data = (await res.json()) as AgentDetail;

  return (
    <main>
      <p style={{ fontSize: 14, color: "#666" }}>
        <Link href="/dashboard">Dashboard</Link> / <code>{data.agent.repo}</code>
      </p>
      <h1 style={{ marginTop: 8 }}>{data.agent.name}</h1>
      <p style={{ color: "#666" }}>
        <code>{data.agent.slug}</code> ·{" "}
        <Link href={`/a/${slug}`}>Playground</Link>
      </p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginTop: 24,
        }}
      >
        <StatCard label="Runs" value={String(data.stats.runCount)} />
        <StatCard label="Avg cost" value={formatUsd(data.stats.avgCostUsd)} />
        <StatCard label="Error rate" value={formatPct(data.stats.errorRate)} />
        <StatCard
          label="Last deploy"
          value={
            data.lastDeploy
              ? `${data.lastDeploy.status} · ${data.lastDeploy.commitSha.slice(0, 7)}`
              : "—"
          }
        />
      </section>

      {data.lastDeploy && (
        <p style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          Deployed {new Date(data.lastDeploy.createdAt).toLocaleString()}
          {data.lastDeploy.isPreview && data.lastDeploy.prNumber != null
            ? ` · PR #${data.lastDeploy.prNumber}`
            : ""}
        </p>
      )}

      <SurfaceToggles
        orgId={orgId}
        projectId={projectId}
        slug={slug}
        initialSurfaces={(data.agent.surfaces as string[]) ?? []}
        initialPublic={Boolean(data.agent.public)}
      />

      <ConnectPanel surfaces={data.connect.surfaces} snippets={data.connect.snippets} />

      <section style={{ marginTop: 32 }}>
        <h2>Recent runs</h2>
        <RunsTable runs={data.recentRuns} projectId={projectId} slug={slug} />
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 12, color: "#71717a", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
