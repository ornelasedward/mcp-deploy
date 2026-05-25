import { Hono } from "hono";
import type { Database } from "@platform/db";
import { exportAuditLog } from "@platform/db";
import type { AuthContext } from "@platform/auth";
import { canDeploy } from "@platform/auth";
import { requireRole } from "../middleware/auth";

function assertOrgAccess(c: { get: (k: "auth") => AuthContext; json: Function }, orgId: string) {
  const auth = c.get("auth");
  if (auth.orgId !== orgId) return c.json({ error: "forbidden" }, 403);
  return null;
}

export function auditRoutes(db: Database) {
  const app = new Hono();

  app.get("/v1/orgs/:orgId/audit/export", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canDeploy);
    if (forbidden) return forbidden;

    const sinceRaw = c.req.query("since");
    const untilRaw = c.req.query("until");
    const limitRaw = c.req.query("limit");
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    const until = untilRaw ? new Date(untilRaw) : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;

    if (since && Number.isNaN(since.getTime())) {
      return c.json({ error: "invalid since (ISO 8601)" }, 400);
    }
    if (until && Number.isNaN(until.getTime())) {
      return c.json({ error: "invalid until (ISO 8601)" }, 400);
    }

    const body = await exportAuditLog(db, { orgId, since, until, limit });
    const filename = `agentd-audit-${orgId}-${new Date().toISOString().slice(0, 10)}.jsonl`;
    return new Response(body, {
      headers: {
        "content-type": "application/x-ndjson",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  return app;
}
