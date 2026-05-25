import type { Context, Next } from "hono";
import type { Config } from "@platform/config";
import { OrgStore } from "@platform/db";
import {
  type AuthContext,
  hashApiKey,
  isOrgApiKey,
  verifyClerkToken,
  verifySamlSession,
} from "@platform/auth";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export interface AuthMiddlewareOpts {
  config: Config;
  orgStore?: OrgStore;
}

const PUBLIC_PATHS = [
  "/health",
  "/api/inngest",
  "/v1/webhooks/github",
  "/v1/webhooks/stripe",
  "/v1/auth/saml",
];

function isPublicApiPath(path: string) {
  return path.startsWith("/v1/public/") || path.startsWith("/internal/bridge/");
}

export function createAuthMiddleware(opts: AuthMiddlewareOpts) {
  const { config, orgStore } = opts;
  const authMode = config.AUTH_MODE;

  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) || isPublicApiPath(path)) {
      return next();
    }

    const bearer = c.req.header("authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : c.req.header("x-api-key");

    // Platform bootstrap key (dev / automation)
    if (config.API_KEY && token === config.API_KEY) {
      const orgId = c.req.header("x-org-id") ?? config.DEFAULT_ORG_ID;
      c.set("auth", { orgId, role: "owner", method: "platform", userId: "platform" });
      return next();
    }

    // SAML session token (enterprise BYOC)
    const samlSecret = config.SAML_SESSION_SECRET;
    if (
      config.SAML_ENABLED &&
      samlSecret &&
      token &&
      (authMode === "saml" || authMode === "mixed")
    ) {
      const session = verifySamlSession(token, samlSecret);
      if (session) {
        const orgId = c.req.header("x-org-id") ?? session.orgId;
        if (orgStore) {
          await orgStore.ensureOrg(orgId, orgId);
          await orgStore.upsertMember(orgId, session.sub, "owner");
        }
        c.set("auth", {
          orgId,
          userId: session.sub,
          role: "owner",
          method: "saml",
        });
        return next();
      }
    }

    // Per-org API keys (agd_live_...)
    if (token && isOrgApiKey(token) && orgStore) {
      const resolved = await orgStore.resolveApiKey(hashApiKey(token));
      if (!resolved) return c.json({ error: "invalid api key" }, 401);
      c.set("auth", {
        orgId: resolved.orgId,
        role: resolved.role,
        method: "api_key",
      });
      return next();
    }

    // Clerk JWT
    const clerkSecret = config.CLERK_SECRET_KEY;
    if (token && clerkSecret && (authMode === "clerk" || authMode === "mixed")) {
      const identity = await verifyClerkToken(token, clerkSecret);
      if (identity) {
        const orgId = c.req.header("x-org-id") ?? identity.orgId;
        if (!orgId) return c.json({ error: "x-org-id required" }, 400);
        if (orgStore) {
          let role = await orgStore.getMemberRole(orgId, identity.userId);
          if (!role && authMode === "dev") role = "owner";
          if (!role) return c.json({ error: "not a member of this org" }, 403);
          c.set("auth", { orgId, userId: identity.userId, role, method: "clerk" });
          return next();
        }
        c.set("auth", { orgId, userId: identity.userId, role: "owner", method: "clerk" });
        return next();
      }
    }

    // Dev headers (local only)
    if (authMode === "dev" || authMode === "mixed") {
      const orgId = c.req.header("x-org-id");
      const userId = c.req.header("x-user-id") ?? "dev-user";
      if (orgId) {
        if (orgStore) await orgStore.upsertMember(orgId, userId, "owner");
        c.set("auth", { orgId, userId, role: "owner", method: "dev" });
        return next();
      }
    }

    return c.json({ error: "unauthorized" }, 401);
  };
}

export function requireRole(c: Context, check: (role: AuthContext["role"]) => boolean) {
  const auth = c.get("auth");
  if (!auth || !check(auth.role)) {
    return c.json({ error: "forbidden" }, 403);
  }
  return null;
}
