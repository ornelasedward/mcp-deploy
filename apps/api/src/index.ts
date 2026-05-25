import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
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
import { handleMcpHttp, buildMcpServerCard } from "@platform/mcp";
import { enqueueBackground, inngest } from "@platform/durable";
import type { Config } from "@platform/config";
import {
  verifyGitHubSignature,
  parseGitHubWebhook,
  runDeployEvals,
  formatEvalPrComment,
  postGithubPrComment,
  detectFrameworkInfo,
  planFrameworkImport,
} from "@platform/build";
import { DashboardStore, OrgStore, getProductionEvalBaseline } from "@platform/db";
import { canDeploy, canRun } from "@platform/auth";
import { handleBridgeRequest } from "@platform/runtime";
import { createAuthMiddleware, requireRole } from "./middleware/auth";
import { BillingLimitError } from "@platform/billing";
import { orgRoutes } from "./routes/orgs";
import { dashboardRoutes } from "./routes/dashboard";
import { publicRoutes } from "./routes/public";
import { billingRoutes } from "./routes/billing";
import { auditRoutes } from "./routes/audit";
import { samlRoutes } from "./routes/saml";
import { inngestHandler } from "./inngest";

const platform = await buildPlatform();
const resolveBudget = (orgId: string) => platform.resolveBudget(orgId);

function preferAsyncRun(config: Config, query: { async?: string; sync?: string }): boolean {
  if (query.sync === "1") return false;
  if (query.async === "1") return true;
  return config.DURABLE === "inngest" && config.DEPLOY_ENV !== "development";
}

async function queueAgentRun(opts: {
  runId: string;
  slug: string;
  input: unknown;
  orgId: string;
  source: "http";
  projectId?: string;
}) {
  const agent = platform.registry.get(opts.slug, opts.orgId);
  if (!agent) throw new Error(`agent not found: ${opts.slug}`);

  await platform.billing.assertCanRun(opts.orgId, agent.distribute);

  await platform.trace.beginRun?.({
    runId: opts.runId,
    orgId: opts.orgId,
    source: opts.source,
    agentSlug: agent.slug,
    input: opts.input,
    status: "queued",
  });

  const budget = await resolveBudget(opts.orgId);
  const payload = {
    slug: opts.slug,
    input: opts.input,
    orgId: opts.orgId,
    runId: opts.runId,
    source: opts.source,
    projectId: opts.projectId,
  };

  if (platform.config.INNGEST_EVENT_KEY) {
    await inngest.send({ name: "agent/run", data: payload });
    return;
  }

  enqueueBackground(async () => {
    await platform.trace.updateRunStatus?.(opts.runId, "running");
    await platform.dispatch({
      agent,
      input: opts.input,
      source: opts.source,
      orgId: opts.orgId,
      idempotencyKey: opts.runId,
      budget,
      projectId: opts.projectId,
    });
  });
}
const publicRateLimiter = new IpRateLimiter(platform.config.PUBLIC_RATE_LIMIT_PER_HOUR);
const orgStore = platform.db ? new OrgStore(platform.db) : undefined;
const dashboardStore = platform.db ? new DashboardStore(platform.db) : undefined;
const app = new Hono();

await hydrateRegistry(platform.registry, {
  agentsDir: platform.config.AGENTS_DIR ?? resolve(process.cwd(), "examples"),
  deploy: platform.deploy,
  defaultOrgId: platform.config.DEFAULT_ORG_ID,
});

app.post("/v1/webhooks/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "missing stripe-signature" }, 400);
  try {
    const raw = await c.req.text();
    await platform.billing.handleWebhook(raw, sig);
    return c.json({ received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook failed";
    return c.json({ error: msg }, 400);
  }
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

app.route("/", samlRoutes(platform.config, orgStore));

app.use("*", createAuthMiddleware({ config: platform.config, orgStore }));

app.route("/", billingRoutes(platform.billing, platform.config.WEB_BASE_URL));

if (platform.db) {
  app.route("/", auditRoutes(platform.db));
}

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
      saml: Boolean(platform.config.SAML_ENABLED),
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

  const idempotencyKey = c.req.header("idempotency-key") ?? randomUUID();
  const { input } = await c.req.json<{ input: unknown }>();
  const projectId = c.req.query("projectId") ?? undefined;

  if (preferAsyncRun(platform.config, c.req.query())) {
    await queueAgentRun({
      runId: idempotencyKey,
      slug: agent.slug,
      input,
      orgId: auth.orgId,
      source: "http",
      projectId,
    });
    return c.json(
      {
        runId: idempotencyKey,
        status: "queued",
        poll: `${platform.config.PLATFORM_BASE_URL}/v1/agents/${agent.slug}/runs/${idempotencyKey}`,
      },
      202,
    );
  }

  const budget = await resolveBudget(auth.orgId);
  try {
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
  } catch (e) {
    if (e instanceof BillingLimitError) {
      return c.json({ error: e.message, code: e.code }, 402);
    }
    throw e;
  }
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

app.get("/v1/agents/:slug/runs/:runId", async (c) => {
  const auth = c.get("auth");
  const slug = c.req.param("slug");
  const runId = c.req.param("runId");
  const agent = platform.registry.get(slug, auth.orgId);
  if (!agent) return c.json({ error: "not found" }, 404);

  const snapshot = await platform.trace.getRun?.(runId);
  if (!snapshot || snapshot.orgId !== auth.orgId) {
    return c.json({ error: "not found" }, 404);
  }

  const events = await platform.trace.list(runId);
  const suspended = events.find((e) => e.type === "run.suspended");
  const pendingEvent =
    snapshot.pendingEvent ??
    (suspended?.payload as { event?: string } | undefined)?.event;

  return c.json({
    run: {
      id: snapshot.runId,
      status: snapshot.status,
      source: snapshot.source,
      agentSlug: snapshot.agentSlug,
      costUsd: snapshot.costUsd,
      durationMs: snapshot.durationMs ?? null,
      pendingEvent,
      input: snapshot.input,
      output: snapshot.output,
      error: snapshot.error,
      createdAt: new Date(snapshot.createdAt).toISOString(),
    },
    events,
  });
});

app.post("/v1/agents/:slug/runs/:runId/resume", async (c) => {
  const auth = c.get("auth");
  const forbidden = requireRole(c, canRun);
  if (forbidden) return forbidden;

  const slug = c.req.param("slug");
  const runId = c.req.param("runId");
  const agent = platform.registry.get(slug, auth.orgId);
  if (!agent) return c.json({ error: "not found" }, 404);

  const snapshot = await platform.trace.getRun?.(runId);
  if (!snapshot || snapshot.orgId !== auth.orgId) {
    return c.json({ error: "not found" }, 404);
  }
  if (snapshot.status !== "suspended") {
    return c.json({ error: "run is not suspended", status: snapshot.status }, 409);
  }

  const body = await c.req.json<{ eventName?: string; payload?: unknown }>();
  const events = await platform.trace.list(runId);
  const suspended = events.find((e) => e.type === "run.suspended");
  const eventName =
    body.eventName ??
    snapshot.pendingEvent ??
    (suspended?.payload as { event?: string } | undefined)?.event ??
    "approval";

  if (platform.config.DURABLE !== "inngest") {
    return c.json({ error: "resume requires DURABLE=inngest with Inngest dev server or keys" }, 400);
  }

  await inngest.send({
    name: "agent/resume",
    data: {
      runId,
      orgId: auth.orgId,
      eventName,
      payload: body.payload ?? { approved: true },
    },
  });

  return c.json({ ok: true, runId, eventName });
});

app.get("/v1/agents/:slug/runs/:runId/trace", async (c) => {
  const auth = c.get("auth");
  const agent = platform.registry.get(c.req.param("slug"), auth.orgId);
  if (!agent) return c.json({ error: "not found" }, 404);
  const events = await platform.trace.list(c.req.param("runId"));
  return c.json({ runId: c.req.param("runId"), events });
});

app.get("/v1/agents/:slug/mcp", async (c) => {
  const auth = c.get("auth");
  const agent = platform.registry.get(c.req.param("slug"), auth.orgId);
  if (!agent || !isEnabled(agent, "mcp")) return c.json({ error: "not found" }, 404);

  let keyHint: string | undefined;
  if (orgStore) {
    const keys = await orgStore.listApiKeys(auth.orgId).catch(() => []);
    if (keys[0]?.keyPrefix && platform.config.API_KEY) {
      keyHint = platform.config.API_KEY;
    }
  } else if (platform.config.API_KEY) {
    keyHint = platform.config.API_KEY;
  }

  const card = buildMcpServerCard(
    agent,
    platform.config.PLATFORM_BASE_URL,
    platform.config.WEB_BASE_URL,
    { apiKey: keyHint, orgId: auth.orgId },
  );
  return c.json(card);
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

app.post("/v1/detect-framework", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json<{ projectDir?: string; dir?: string }>();
  const projectDir = body.projectDir ?? body.dir;
  if (!projectDir) return c.json({ error: "projectDir required" }, 400);

  const info = await detectFrameworkInfo(projectDir);
  const plan = await planFrameworkImport(projectDir);
  return c.json({
    orgId: auth.orgId,
    framework: info.framework,
    entryPath: info.entryPath,
    plan: plan ?? undefined,
    docsPath: "/docs/frameworks/README.md",
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

  const budget = await resolveBudget(orgId);
  let evalOutcome: Awaited<ReturnType<typeof runDeployEvals>> = null;
  try {
    evalOutcome = await runDeployEvals({
      agent: result.agent,
      agentRoot: result.agentRoot,
      deploymentId: result.deploymentId,
      orgId,
      projectId: result.projectId,
      dispatch: platform.dispatch,
      budget,
      gateway: platform.gateway,
      deploy: platform.deploy,
      maxRegression: platform.config.EVAL_REGRESSION_DELTA,
      blockDeploy: platform.config.EVAL_BLOCK_DEPLOY,
      getBaseline: (projectId) =>
        platform.db
          ? getProductionEvalBaseline(platform.db, projectId)
          : Promise.resolve(new Map()),
    });
  } catch (err) {
    console.warn("[deploy] evals skipped:", err);
  }

  const status = evalOutcome?.blocked ? "failed" : result.status;
  return c.json({
    status,
    ...result,
    evalSummary: evalOutcome
      ? {
          passed: evalOutcome.results.filter((r) => r.passed).length,
          total: evalOutcome.results.length,
          gatePassed: evalOutcome.gate.passed,
          avgScore: evalOutcome.gate.avgScore,
        }
      : undefined,
    evalGate: evalOutcome?.gate,
  });
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

  const budget = await resolveBudget(orgId);
  let evalOutcome: Awaited<ReturnType<typeof runDeployEvals>> = null;
  try {
    evalOutcome = await runDeployEvals({
      agent: result.agent,
      agentRoot: result.agentRoot,
      deploymentId: result.deploymentId,
      orgId,
      projectId: result.projectId,
      dispatch: platform.dispatch,
      budget,
      gateway: platform.gateway,
      deploy: platform.deploy,
      maxRegression: platform.config.EVAL_REGRESSION_DELTA,
      blockDeploy: platform.config.EVAL_BLOCK_DEPLOY && parsed.isPreview,
      getBaseline: (projectId) =>
        platform.db
          ? getProductionEvalBaseline(platform.db, projectId)
          : Promise.resolve(new Map()),
    });
  } catch (err) {
    console.warn("[webhook] evals skipped:", err);
  }

  if (
    parsed.isPreview &&
    parsed.prNumber &&
    platform.config.GITHUB_TOKEN &&
    evalOutcome
  ) {
    try {
      const baseline = await getProductionEvalBaseline(platform.db!, result.projectId);
      const body = formatEvalPrComment({
        slug: result.agent.slug,
        results: evalOutcome.results,
        gate: evalOutcome.gate,
        baseline,
        urls: result.urls,
      });
      await postGithubPrComment({
        token: platform.config.GITHUB_TOKEN,
        repoFullName: parsed.repoFullName,
        prNumber: parsed.prNumber,
        body,
      });
    } catch (err) {
      console.warn("[webhook] PR comment failed:", err);
    }
  }

  return c.json({
    status: evalOutcome?.blocked ? "blocked" : "deployed",
    event: parsed.event,
    production: parsed.isProduction,
    orgId,
    slug: result.agent.slug,
    urls: result.urls,
    deploymentId: result.deploymentId,
    artifactDir: result.artifactDir,
    evalGate: evalOutcome?.gate,
    evalSummary: evalOutcome
      ? {
          passed: evalOutcome.results.filter((r) => r.passed).length,
          total: evalOutcome.results.length,
          gatePassed: evalOutcome.gate.passed,
        }
      : undefined,
  });
});

serve({ fetch: app.fetch, port: platform.config.PORT });
console.log(`api listening on :${platform.config.PORT} (${platform.registry.all().length} agents)`);
