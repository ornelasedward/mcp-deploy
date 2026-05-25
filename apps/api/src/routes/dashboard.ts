import { Hono } from "hono";
import type { DashboardStore, OrgStore, BudgetStore } from "@platform/db";
import type { TraceStore } from "@platform/trace";
import type { AuthContext } from "@platform/auth";
import { canDeploy } from "@platform/auth";
import { connectSnippets } from "@platform/core";
import type { ResolvedAgent, Surface } from "@platform/sdk";
import { SURFACES } from "@platform/sdk";
import { requireRole } from "../middleware/auth";
import type { Config } from "@platform/config";

function assertOrgAccess(c: { get: (k: "auth") => AuthContext; json: Function }, orgId: string) {
  if (c.get("auth").orgId !== orgId) return c.json({ error: "forbidden" }, 403);
  return null;
}

export interface DashboardRoutesOpts {
  dashboard: DashboardStore;
  orgStore: OrgStore;
  budgetStore?: BudgetStore;
  trace: TraceStore;
  config: Config;
  getAgent: (slug: string, orgId: string) => ResolvedAgent | undefined;
  patchAgent: (
    orgId: string,
    slug: string,
    patch: Partial<ResolvedAgent>,
  ) => ResolvedAgent | undefined;
}

export function dashboardRoutes(opts: DashboardRoutesOpts) {
  const { dashboard, orgStore, budgetStore, trace, config, getAgent, patchAgent } = opts;
  const app = new Hono();

  app.get("/v1/orgs/:orgId/overview", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const agents = await dashboard.listAgentsOverview(orgId);
    const usage = budgetStore ? await budgetStore.getOrgSpendSummary(orgId) : undefined;
    return c.json({ orgId, agents, usage });
  });

  app.get("/v1/orgs/:orgId/projects/:projectId/agents/:slug", async (c) => {
    const { orgId, projectId, slug } = {
      orgId: c.req.param("orgId"),
      projectId: c.req.param("projectId"),
      slug: c.req.param("slug"),
    };
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;

    const row = await dashboard.getAgent(orgId, projectId, slug);
    if (!row) return c.json({ error: "not found" }, 404);

    const [stats, lastDeploy, recentRuns] = await Promise.all([
      dashboard.getAgentStats(orgId, slug),
      dashboard.getLastDeployment(projectId),
      dashboard.listRuns(orgId, slug, 20),
    ]);

    const resolved = getAgent(slug, orgId);
    const keys = await orgStore.listApiKeys(orgId).catch(() => []);
    const keyHint = keys[0]?.keyPrefix ? `${keys[0].keyPrefix}…` : "$AGENTD_API_KEY";

    const snippets = resolved
      ? connectSnippets(resolved, config.PLATFORM_BASE_URL, {
          apiKey: keyHint,
          orgId,
        })
      : {};

    return c.json({
      agent: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        projectId: row.projectId,
        repo: row.repo,
        surfaces: row.distribute,
        public: row.publicPlayground,
      },
      stats,
      lastDeploy,
      recentRuns,
      connect: { surfaces: resolved?.distribute ?? row.distribute, snippets },
    });
  });

  app.patch("/v1/orgs/:orgId/projects/:projectId/agents/:slug", async (c) => {
    const orgId = c.req.param("orgId");
    const projectId = c.req.param("projectId");
    const slug = c.req.param("slug");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canDeploy);
    if (forbidden) return forbidden;

    const body = await c.req.json<{ distribute?: Surface[]; public?: boolean }>();
    const distribute = body.distribute?.filter((s) => SURFACES.includes(s));
    const updated = await dashboard.updateAgentSettings(orgId, projectId, slug, {
      distribute,
      public: body.public,
    });
    if (!updated) return c.json({ error: "not found" }, 404);

    const patched = patchAgent(orgId, slug, {
      distribute: updated.distribute as Surface[],
      public: updated.publicPlayground,
    });

    return c.json({
      agent: {
        ...updated,
        public: updated.publicPlayground,
        surfaces: updated.distribute,
        registrySynced: Boolean(patched),
      },
    });
  });

  app.get("/v1/orgs/:orgId/projects/:projectId/agents/:slug/runs", async (c) => {
    const orgId = c.req.param("orgId");
    const slug = c.req.param("slug");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;

    const row = await dashboard.getAgent(orgId, c.req.param("projectId"), slug);
    if (!row) return c.json({ error: "not found" }, 404);

    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const runs = await dashboard.listRuns(orgId, slug, limit);
    return c.json({ runs });
  });

  app.get("/v1/orgs/:orgId/projects/:projectId/agents/:slug/runs/:runId", async (c) => {
    const orgId = c.req.param("orgId");
    const slug = c.req.param("slug");
    const runId = c.req.param("runId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;

    const row = await dashboard.getAgent(orgId, c.req.param("projectId"), slug);
    if (!row) return c.json({ error: "not found" }, 404);

    const run = await dashboard.getRun(orgId, runId);
    if (!run || run.agentSlug !== slug) return c.json({ error: "not found" }, 404);

    const events = await trace.list(runId);
    return c.json({ run, events });
  });

  return app;
}
