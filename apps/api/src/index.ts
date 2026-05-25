import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import {
  buildPlatform,
  connectSnippets,
  isEnabled,
  hydrateRegistry,
  IpRateLimiter,
  sseResponse,
  streamAgentRun,
} from "@platform/core";
import { handleMcpHttp } from "@platform/mcp";
import { inngest } from "@platform/durable";
import { runEvals } from "@platform/evals";
import { verifyGitHubSignature, parseGitHubWebhook } from "@platform/build";
import { DashboardStore, OrgStore } from "@platform/db";
import { canDeploy, canRun } from "@platform/auth";
import { handleBridgeRequest } from "@platform/runtime";
import { createAuthMiddleware, requireRole } from "./middleware/auth";
import { orgRoutes } from "./routes/orgs";
import { dashboardRoutes } from "./routes/dashboard";
import { publicRoutes } from "./routes/public";
import { inngestHandler } from "./inngest";

const platform = await buildPlatform();
const resolveBudget = (orgId: string) => platform.resolveBudget(orgId);
const publicRateLimiter = new IpRateLimiter(platform.config.PUBLIC_RATE_LIMIT_PER_HOUR);
const orgStore = platform.db ? new OrgStore(platform.db) : undefined;
const dashboardStore = platform.db ? new DashboardStore(platform.db) : undefined;
const app = new Hono();

await hydrateRegistry(platform.registry, {
  agentsDir: platform.config.AGENTS_DIR ?? resolve(process.cwd(), "examples"),
  deploy: platform.deploy,
  defaultOrgId: platform.config.DEFAULT_ORG_ID,
});

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "mcp-session-id",
      "Last-Event-ID",
      "mcp-protocol-version",
      "authorization",
      "x-api-key",
      "x-org-id",
      "x-user-id",
      "idempotency-key",
      "x-hub-signature-256",
      "x-github-event",
    ],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
  }),
);

app.all("/internal/bridge/:runId/*", async (c) =>
  handleBridgeRequest(platform.bridgeRegistry, platform.bridgeSecret, c.req.raw),
);
app.all("/internal/bridge/:runId", async (c) =>
  handleBridgeRequest(platform.bridgeRegistry, platform.bridgeSecret, c.req.raw),
);

app.use("*", createAuthMiddleware({ config: platform.config, orgStore }));

app.route("/", publicRoutes(platform, dashboardStore, publicRateLimiter));

if (orgStore) {
  app.route(
    "/",
    orgRoutes(orgStore, {
      budgetStore: platform.budgetStore,
      secretsStore: platform.secretsStore,
    }),
  );
}
if (dashboardStore && orgStore) {
  app.route(
    "/",
    dashboardRoutes({
      dashboard: dashboardStore,
      orgStore,
      budgetStore: platform.budgetStore,
      trace: platform.trace,
      config: platform.config,
      getAgent: (slug, orgId) => platform.registry.get(slug, orgId),
      patchAgent: (orgId, slug, patch) => platform.registry.patch(orgId, slug, patch),
    }),
  );
}

app.get("/health", (c) =>
  c.json({
    ok: true,
    deployEnv: platform.config.DEPLOY_ENV,
    runtime: platform.config.RUNTIME,
    e2bMock: Boolean(platform.config.E2B_MOCK),
    platformDomain: platform.config.PLATFORM_DOMAIN ?? null,
    authMode: platform.config.AUTH_MODE,
    agents: platform.registry.all().length,
    urls: {
      api: platform.config.PLATFORM_BASE_URL,
      web: platform.config.WEB_BASE_URL,
    },
    mode: {
      gateway: platform.config.GATEWAY,
      runtime: platform.config.RUNTIME,
      durable: platform.config.DURABLE,
      trace: platform.config.TRACE_STORE,
      db: Boolean(platform.db),
      artifactsDir: platform.config.ARTIFACTS_DIR,
    },
  }),
);

app.all("/api/inngest", inngestHandler);
app.all("/api/inngest/*", inngestHandler);

app.get("/v1/agents", async (c) => {
  const auth = c.get("auth");
  const registryAgents = platform.registry.all(auth.orgId);
  const dbBySlug = dashboardStore
    ? new Map(
        (await dashboardStore.listAgentsOverview(auth.orgId)).map((a) => [a.slug, a]),
      )
    : new Map();

  return c.json({
    orgId: auth.orgId,
    agents: registryAgents.map((a) => {
      const db = dbBySlug.get(a.slug);
      return {
        slug: a.slug,
        name: a.name,
        description: a.description,
        surfaces: a.distribute,
        public: a.public ?? false,
        projectId: db?.projectId,
        stats: db
          ? {
              runCount: db.runCount,
              errorRate: db.errorRate,
              avgCostUsd: db.avgCostUsd,
            }
          : undefined,
        lastDeploy: db?.lastDeploy ?? undefined,
      };
    }),
  });
});

app.post("/v1/agents/:slug/run", async (c) => {
  const auth = c.get("auth");
  const forbidden = requireRole(c, canRun);
  if (forbidden) return forbidden;

  const agent = platform.registry.get(c.req.param("slug"), auth.orgId);
  if (!agent || !isEnabled(agent, "http")) return c.json({ error: "not found" }, 404);

  const asyncRun = c.req.query("async") === "1";
  const idempotencyKey = c.req.header("idempotency-key") ?? randomUUID();
  const { input } = await c.req.json<{ input: unknown }>();

  if (asyncRun && platform.config.DURABLE === "inngest") {
    await inngest.send({
      name: "agent/run",
      data: {
        slug: agent.slug,
        input,
        orgId: auth.orgId,
        runId: idempotencyKey,
        source: "http",
      },
    });
    return c.json({ runId: idempotencyKey, status: "queued" }, 202);
  }

  const budget = await resolveBudget(auth.orgId);
  const projectId = c.req.query("projectId") ?? undefined;
  const result = await platform.dispatch({
    agent,
    input,
    source: "http",
    orgId: auth.orgId,
    idempotencyKey,
    budget,
    projectId,
  });
  return c.json(result, result.status === "succeeded" ? 200 : 500);
});

app.post("/v1/agents/:slug/run/stream", async (c) => {
  const auth = c.get("auth");
  const forbidden = requireRole(c, canRun);
  if (forbidden) return forbidden;

  const agent = platform.registry.get(c.req.param("slug"), auth.orgId);
  if (!agent || !isEnabled(agent, "http")) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<{ input: unknown }>();

  return sseResponse(async (send) => {
    send("run.start", { slug: agent.slug, orgId: auth.orgId });
    const budget = await resolveBudget(auth.orgId);
    await streamAgentRun({
      dispatch: platform.dispatch,
      trace: platform.trace,
      agent,
      input: body.input,
      orgId: auth.orgId,
      source: "playground",
      budget,
      onEvent: (event, data) => send(event, data),
    });
  });
});

app.all("/mcp/:slug", async (c) => {
  const auth = c.get("auth");
  const forbidden = requireRole(c, canRun);
  if (forbidden) return forbidden;

  const agent = platform.registry.get(c.req.param("slug"), auth.orgId);
  if (!agent || !isEnabled(agent, "mcp")) return c.json({ error: "not found" }, 404);

  const budget = await resolveBudget(auth.orgId);
  const res = await handleMcpHttp(
    agent,
    { dispatch: platform.dispatch, orgId: auth.orgId, budget },
    c.req.raw,
  );
  return res;
});

app.get("/v1/agents/:slug/runs/:runId/trace", async (c) => {
  const auth = c.get("auth");
  const agent = platform.registry.get(c.req.param("slug"), auth.orgId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const events = await platform.trace.list(c.req.param("runId"));
  return c.json({ runId: c.req.param("runId"), events });
});

app.get("/v1/agents/:slug/connect", async (c) => {
  const auth = c.get("auth");
  const agent = platform.registry.get(c.req.param("slug"), auth.orgId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const pr = c.req.query("pr");
  let keyHint = "$AGENTD_API_KEY";
  if (orgStore) {
    const keys = await orgStore.listApiKeys(auth.orgId).catch(() => []);
    if (keys[0]?.keyPrefix) keyHint = `${keys[0].keyPrefix}…`;
  } else if (platform.config.API_KEY) {
    keyHint = platform.config.API_KEY.slice(0, 12) + "…";
  }
  const snippets = connectSnippets(agent, platform.config.PLATFORM_BASE_URL, {
    apiKey: keyHint,
    orgId: auth.orgId,
  });
  const urls =
    pr != null
      ? {
          ...snippets,
          playground: `${platform.config.WEB_BASE_URL.replace(/\/$/, "")}/a/${agent.slug}/pr/${pr}`,
        }
      : snippets;
  return c.json({
    slug: agent.slug,
    surfaces: agent.distribute,
    snippets: urls,
    pr: pr ? Number(pr) : undefined,
  });
});

app.post("/v1/deploy", async (c) => {
  if (!platform.deploy) {
    return c.json({ error: "DATABASE_URL required for deploy" }, 503);
  }
  const auth = c.get("auth");
  const forbidden = requireRole(c, canDeploy);
  if (forbidden) return forbidden;

  const body = await c.req.json<{
    projectDir?: string;
    dir?: string;
    orgId?: string;
    repo?: string;
    commitSha?: string;
    isPreview?: boolean;
    prNumber?: number;
    cloneUrl?: string;
  }>();

  const orgId = body.orgId ?? auth.orgId;
  if (orgId !== auth.orgId && auth.method !== "platform") {
    return c.json({ error: "forbidden" }, 403);
  }

  const result = await platform.deploy.deploy({
    orgId,
    projectDir: body.projectDir ?? body.dir,
    repo: body.repo,
    commitSha: body.commitSha,
    cloneUrl: body.cloneUrl,
    gitToken: platform.config.GITHUB_TOKEN,
    isPreview: body.isPreview,
    prNumber: body.prNumber,
    artifactsDir: platform.config.ARTIFACTS_DIR,
  });

  platform.registry.register(result.agent, orgId);

  let evalSummary: { passed: number; total: number } | undefined;
  if (result.agent.evals) {
    try {
      const casesPath = resolve(
        result.agentRoot,
        result.agent.evals.replace(/^\.\//, ""),
        "cases.json",
      );
      const cases = JSON.parse(await readFile(casesPath, "utf8"));
      const results = await runEvals(result.agent, cases, {
        dispatch: platform.dispatch,
        orgId,
        budget,
      });
      await platform.deploy.saveEvalResults(result.deploymentId, results);
      evalSummary = { passed: results.filter((r) => r.passed).length, total: results.length };
    } catch (err) {
      console.warn("[deploy] evals skipped:", err);
    }
  }

  return c.json({ status: result.status, ...result, evalSummary });
});

app.post("/v1/webhooks/github", async (c) => {
  if (!platform.deploy) return c.json({ error: "DATABASE_URL required" }, 503);

  const rawBody = await c.req.text();
  const secret = platform.config.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig = c.req.header("x-hub-signature-256");
    if (!verifyGitHubSignature(rawBody, sig, secret)) {
      return c.json({ error: "invalid signature" }, 401);
    }
  }

  const event = c.req.header("x-github-event") ?? "";
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const parsed = parseGitHubWebhook(event, payload);
  if (!parsed) {
    return c.json({ ignored: true, event });
  }

  const orgId =
    (await platform.deploy.findOrgByRepo(parsed.repoFullName)) ??
    platform.config.DEFAULT_ORG_ID;

  const result = await platform.deploy.deploy({
    orgId,
    cloneUrl: parsed.cloneUrl,
    commitSha: parsed.commitSha,
    repo: parsed.repoFullName,
    isPreview: parsed.isPreview,
    prNumber: parsed.prNumber,
    gitToken: platform.config.GITHUB_TOKEN,
    artifactsDir: platform.config.ARTIFACTS_DIR,
  });

  platform.registry.register(result.agent, orgId);

  return c.json({
    status: "deployed",
    event: parsed.event,
    production: parsed.isProduction,
    orgId,
    slug: result.agent.slug,
    urls: result.urls,
    deploymentId: result.deploymentId,
    artifactDir: result.artifactDir,
  });
});

serve({ fetch: app.fetch, port: platform.config.PORT });
console.log(`api listening on :${platform.config.PORT} (${platform.registry.all().length} agents)`);
