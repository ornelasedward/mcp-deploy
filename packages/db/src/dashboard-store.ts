import { eq, and, desc, sql, count, avg } from "drizzle-orm";
import type { Surface } from "@platform/sdk";
import { SURFACES } from "@platform/sdk";
import type { Database } from "./index";
import { agents, deployments, projects, runs } from "./schema";

function normalizeSurfaces(raw: unknown): Surface[] {
  if (!Array.isArray(raw)) return [...SURFACES];
  return raw.filter((s): s is Surface => SURFACES.includes(s as Surface));
}

export interface AgentOverview {
  id: string;
  slug: string;
  name: string;
  projectId: string;
  repo: string;
  surfaces: string[];
  runCount: number;
  failedCount: number;
  errorRate: number;
  avgCostUsd: number;
  lastDeploy: {
    id: string;
    status: string;
    commitSha: string;
    createdAt: Date;
    isPreview: boolean;
    prNumber: number | null;
  } | null;
}

export interface RunRow {
  id: string;
  status: string;
  source: string;
  costUsd: number;
  durationMs: number | null;
  createdAt: Date;
  input: unknown;
  output: unknown;
}

export class DashboardStore {
  constructor(private db: Database) {}

  async listAgentsOverview(orgId: string): Promise<AgentOverview[]> {
    const agentRows = await this.db
      .select({
        id: agents.id,
        slug: agents.slug,
        name: agents.name,
        projectId: agents.projectId,
        repo: projects.repo,
        distribute: agents.distribute,
      })
      .from(agents)
      .innerJoin(projects, eq(agents.projectId, projects.id))
      .where(eq(projects.orgId, orgId));

    if (agentRows.length === 0) return [];

    const statsRows = await this.db
      .select({
        agentSlug: runs.agentSlug,
        total: count(),
        failed: sql<number>`coalesce(sum(case when ${runs.status} = 'failed' then 1 else 0 end), 0)`,
        avgCost: avg(runs.costUsd),
      })
      .from(runs)
      .where(eq(runs.orgId, orgId))
      .groupBy(runs.agentSlug);

    const statsBySlug = new Map(
      statsRows
        .filter((s) => s.agentSlug)
        .map((s) => [
          s.agentSlug!,
          {
            runCount: Number(s.total),
            failedCount: Number(s.failed),
            avgCostUsd: Number(s.avgCost ?? 0),
          },
        ]),
    );

    const projectIds = [...new Set(agentRows.map((a) => a.projectId))];
    const deployByProject = new Map<string, AgentOverview["lastDeploy"]>();

    for (const projectId of projectIds) {
      const [d] = await this.db
        .select({
          id: deployments.id,
          status: deployments.status,
          commitSha: deployments.commitSha,
          createdAt: deployments.createdAt,
          isPreview: deployments.isPreview,
          prNumber: deployments.prNumber,
        })
        .from(deployments)
        .where(eq(deployments.projectId, projectId))
        .orderBy(desc(deployments.createdAt))
        .limit(1);
      if (d) deployByProject.set(projectId, d);
    }

    return agentRows.map((a) => {
      const stats = statsBySlug.get(a.slug) ?? { runCount: 0, failedCount: 0, avgCostUsd: 0 };
      const errorRate = stats.runCount > 0 ? stats.failedCount / stats.runCount : 0;
      return {
        id: a.id,
        slug: a.slug,
        name: a.name,
        projectId: a.projectId,
        repo: a.repo,
        surfaces: a.distribute as string[],
        runCount: stats.runCount,
        failedCount: stats.failedCount,
        errorRate,
        avgCostUsd: stats.avgCostUsd,
        lastDeploy: deployByProject.get(a.projectId) ?? null,
      };
    });
  }

  async getAgent(orgId: string, projectId: string, slug: string) {
    const rows = await this.db
      .select({
        id: agents.id,
        slug: agents.slug,
        name: agents.name,
        projectId: agents.projectId,
        repo: projects.repo,
        distribute: agents.distribute,
        publicPlayground: agents.publicPlayground,
      })
      .from(agents)
      .innerJoin(projects, eq(agents.projectId, projects.id))
      .where(
        and(eq(projects.orgId, orgId), eq(agents.projectId, projectId), eq(agents.slug, slug)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findPublicAgentBySlug(slug: string) {
    const rows = await this.db
      .select({
        orgId: projects.orgId,
        projectId: agents.projectId,
        slug: agents.slug,
        name: agents.name,
        publicPlayground: agents.publicPlayground,
      })
      .from(agents)
      .innerJoin(projects, eq(agents.projectId, projects.id))
      .where(and(eq(agents.slug, slug), eq(agents.publicPlayground, true)))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateAgentSettings(
    orgId: string,
    projectId: string,
    slug: string,
    patch: { distribute?: Surface[]; public?: boolean },
  ) {
    const row = await this.getAgent(orgId, projectId, slug);
    if (!row) return null;

    const distribute = patch.distribute ?? normalizeSurfaces(row.distribute);
    const publicPlayground = patch.public ?? row.publicPlayground;

    await this.db
      .update(agents)
      .set({
        distribute,
        publicPlayground,
      })
      .where(eq(agents.id, row.id));

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      projectId: row.projectId,
      distribute,
      publicPlayground,
    };
  }

  async getAgentStats(orgId: string, slug: string) {
    const [row] = await this.db
      .select({
        total: count(),
        failed: sql<number>`coalesce(sum(case when ${runs.status} = 'failed' then 1 else 0 end), 0)`,
        avgCost: avg(runs.costUsd),
      })
      .from(runs)
      .where(and(eq(runs.orgId, orgId), eq(runs.agentSlug, slug)));

    const total = Number(row?.total ?? 0);
    const failed = Number(row?.failed ?? 0);
    return {
      runCount: total,
      failedCount: failed,
      errorRate: total > 0 ? failed / total : 0,
      avgCostUsd: Number(row?.avgCost ?? 0),
    };
  }

  async listRuns(orgId: string, slug: string, limit = 50): Promise<RunRow[]> {
    const rows = await this.db
      .select({
        id: runs.id,
        status: runs.status,
        source: runs.source,
        costUsd: runs.costUsd,
        durationMs: runs.durationMs,
        createdAt: runs.createdAt,
        input: runs.input,
        output: runs.output,
      })
      .from(runs)
      .where(and(eq(runs.orgId, orgId), eq(runs.agentSlug, slug)))
      .orderBy(desc(runs.createdAt))
      .limit(limit);
    return rows;
  }

  async getRun(orgId: string, runId: string) {
    const rows = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getLastDeployment(projectId: string) {
    const [d] = await this.db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, projectId))
      .orderBy(desc(deployments.createdAt))
      .limit(1);
    return d ?? null;
  }
}
