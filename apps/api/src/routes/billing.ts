import { Hono } from "hono";
import type { BillingService } from "@platform/billing";
import type { AuthContext } from "@platform/auth";
import { requireRole } from "../middleware/auth";
import { canDeploy } from "@platform/auth";

function assertOrgAccess(c: { get: (k: "auth") => AuthContext; json: Function }, orgId: string) {
  const auth = c.get("auth");
  if (auth.orgId !== orgId) return c.json({ error: "forbidden" }, 403);
  return null;
}

export function billingRoutes(billing: BillingService, webBaseUrl: string) {
  const app = new Hono();

  app.get("/v1/orgs/:orgId/billing", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const overview = await billing.getOverview(orgId);
    return c.json({
      ...overview,
      billingEnabled: billing.enabled,
      freeTierRunsPerMonth: 100,
    });
  });

  app.post("/v1/orgs/:orgId/billing/checkout", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canDeploy);
    if (forbidden) return forbidden;
    if (!billing.enabled) return c.json({ error: "billing not configured" }, 503);

    const body = await c.req.json<{ successPath?: string; cancelPath?: string }>().catch(() => ({}));
    const success = body.successPath ?? "/dashboard/billing?checkout=success";
    const cancel = body.cancelPath ?? "/dashboard/billing?checkout=cancel";
    const session = await billing.createCheckoutSession(orgId, {
      success: `${webBaseUrl}${success}`,
      cancel: `${webBaseUrl}${cancel}`,
    });
    return c.json(session);
  });

  app.post("/v1/orgs/:orgId/billing/portal", async (c) => {
    const orgId = c.req.param("orgId");
    const denied = assertOrgAccess(c, orgId);
    if (denied) return denied;
    const forbidden = requireRole(c, canDeploy);
    if (forbidden) return forbidden;
    if (!billing.enabled) return c.json({ error: "billing not configured" }, 503);

    const body = await c.req.json<{ returnPath?: string }>().catch(() => ({}));
    const returnPath = body.returnPath ?? "/dashboard/billing";
    const url = await billing.createPortalSession(orgId, `${webBaseUrl}${returnPath}`);
    return c.json({ url });
  });

  return app;
}
