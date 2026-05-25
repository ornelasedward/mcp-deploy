import { Hono } from "hono";
import type { OrgStore, BudgetStore, SecretsStore } from "@platform/db";
import {
  canDeploy,
  canManageKeys,
  generateApiKey,
  hashApiKey,
  type AuthContext,
} from "@platform/auth";
import { requireRole } from "../middleware/auth";

function assertOrgAccess(c: { get: (k: "auth") => AuthContext; json: Function }, orgId: string) {
  const auth = c.get("auth");
  if (auth.orgId !== orgId) return c.json({ error: "forbidden" }, 403);
  return null;
}

export interface OrgRoutesOpts {
  budgetStore?: BudgetStore;
  secretsStore?: SecretsStore;
}

export function orgRoutes(orgStore: OrgStore, opts: OrgRoutesOpts = {}) {
  const { budgetStore, secretsStore } = opts;
  const app = new Hono();

  app.post("/v1/me/sync", async (c) => {
    const auth = c.get("auth");
    if (!auth.userId) return c.json({ error: "user identity required" }, 400);
    const body = await c.req.json<{ orgId: string; name?: string }>();
    const orgId = body.orgId ?? auth.orgId;
    if (auth.orgId !== orgId && auth.method !== "platform") {
      return c.json({ error: "forbidden" }, 403);
    }
    await orgStore.ensureOrg(orgId, body.name ?? orgId);
    await orgStore.upsertMember(orgId, auth.userId, "owner");
    return c.json({ orgId, userId: auth.userId, role: "owner" });
  });

  app.get("/v1/orgs/:orgId/projects", async (c) => {
    const denied = assertOrgAccess(c, c.req.param("orgId"));
    if (denied) return denied;
    const projects = await orgStore.listProjects(c.req.param("orgId"));
    return c.json({ projects });
  });

  app.post("/v1/orgs/:orgId/projects", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canDeploy);
    if (forbidden) return forbidden;
    const body = await c.req.json<{ repo: string; framework?: string }>();
    if (!body.repo) return c.json({ error: "repo required" }, 400);
    const project = await orgStore.createProject(orgId, body.repo, body.framework);
    return c.json({ project }, 201);
  });

  app.delete("/v1/orgs/:orgId/projects/:projectId", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canDeploy);
    if (forbidden) return forbidden;
    const ok = await orgStore.deleteProject(orgId, c.req.param("projectId"));
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  app.get("/v1/orgs/:orgId/api-keys", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canManageKeys);
    if (forbidden) return forbidden;
    const keys = await orgStore.listApiKeys(orgId);
    return c.json({ keys });
  });

  app.post("/v1/orgs/:orgId/api-keys", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canManageKeys);
    if (forbidden) return forbidden;
    const body = await c.req.json<{ name: string; role?: "owner" | "member" | "viewer" }>();
    if (!body.name) return c.json({ error: "name required" }, 400);
    const role = body.role ?? "member";
    const { key, prefix, hash } = generateApiKey();
    const row = await orgStore.createApiKey(orgId, body.name, hash, prefix, role);
    return c.json({ key, apiKey: row }, 201);
  });

  app.delete("/v1/orgs/:orgId/api-keys/:keyId", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canManageKeys);
    if (forbidden) return forbidden;
    const ok = await orgStore.revokeApiKey(orgId, c.req.param("keyId"));
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  if (budgetStore) {
    app.get("/v1/orgs/:orgId/budget", async (c) => {
      const orgId = c.req.param("orgId");
      const denied = assertOrgAccess(c, orgId);
      if (denied) return denied;
      const budget = await budgetStore.getOrgBudget(orgId);
      const usage = await budgetStore.getOrgSpendSummary(orgId);
      return c.json({ budget, usage });
    });

    app.patch("/v1/orgs/:orgId/budget", async (c) => {
      const orgId = c.req.param("orgId");
      const denied = assertOrgAccess(c, orgId);
      if (denied) return denied;
      const forbidden = requireRole(c, canDeploy);
      if (forbidden) return forbidden;
      const body = await c.req.json<{
        monthlyCapUsd?: number;
        perRunCapUsd?: number;
        hardStop?: boolean;
      }>();
      await budgetStore.updateOrgBudget(orgId, body);
      const budget = await budgetStore.getOrgBudget(orgId);
      const usage = await budgetStore.getOrgSpendSummary(orgId);
      return c.json({ budget, usage });
    });

    app.get("/v1/orgs/:orgId/usage", async (c) => {
      const orgId = c.req.param("orgId");
      const denied = assertOrgAccess(c, orgId);
      if (denied) return denied;
      const usage = await budgetStore.getOrgSpendSummary(orgId);
      return c.json({ usage });
    });
  }

  if (secretsStore) {
    app.get("/v1/orgs/:orgId/projects/:projectId/secrets", async (c) => {
      const orgId = c.req.param("orgId");
      const projectId = c.req.param("projectId");
      const denied = assertOrgAccess(c, orgId);
      if (denied) return denied;
      if (!(await secretsStore.assertProjectInOrg(projectId, orgId))) {
        return c.json({ error: "not found" }, 404);
      }
      const names = await secretsStore.listNames(projectId);
      return c.json({ secrets: names.map((name) => ({ name })) });
    });

    app.put("/v1/orgs/:orgId/projects/:projectId/secrets/:name", async (c) => {
      const orgId = c.req.param("orgId");
      const projectId = c.req.param("projectId");
      const denied = assertOrgAccess(c, orgId);
      if (denied) return denied;
      const forbidden = requireRole(c, canDeploy);
      if (forbidden) return forbidden;
      if (!(await secretsStore.assertProjectInOrg(projectId, orgId))) {
        return c.json({ error: "not found" }, 404);
      }
      const body = await c.req.json<{ value: string }>();
      if (!body.value) return c.json({ error: "value required" }, 400);
      await secretsStore.upsert(projectId, c.req.param("name"), body.value);
      return c.json({ ok: true, name: c.req.param("name") });
    });

    app.delete("/v1/orgs/:orgId/projects/:projectId/secrets/:name", async (c) => {
      const orgId = c.req.param("orgId");
      const projectId = c.req.param("projectId");
      const denied = assertOrgAccess(c, orgId);
      if (denied) return denied;
      const forbidden = requireRole(c, canDeploy);
      if (forbidden) return forbidden;
      if (!(await secretsStore.assertProjectInOrg(projectId, orgId))) {
        return c.json({ error: "not found" }, 404);
      }
      const ok = await secretsStore.remove(projectId, c.req.param("name"));
      if (!ok) return c.json({ error: "not found" }, 404);
      return c.json({ ok: true });
    });
  }

  return app;
}
