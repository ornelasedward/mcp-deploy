/**
 * End-to-end smoke test = the platform's guarantee. Boots in LOCAL mode (no vendor accounts),
 * registers the example agent, exercises the dispatcher + surface selector + budget + evals,
 * and prints the trace. If this is green, the spine works.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  buildPlatform,
  connectSnippets,
  enabledSurfaces,
  streamAgentRun,
  findPublicAgentInRegistry,
} from "@platform/core";
import { enqueueBackground } from "@platform/core";
import { runEvals } from "@platform/evals";
import { checkEvalGate, ExportingTraceStore, InMemoryTraceStore } from "@platform/core";
import { handleMcpHttp } from "@platform/mcp";
import {
  verifyGitHubSignature,
  buildFromLocalPath,
  buildAgentUrls,
  detectFrameworkInfo,
  planFrameworkImport,
  writeAdaptedAgent,
} from "@platform/build";
import { buildMcpServerCard } from "@platform/mcp";
import { listDirectoryAgents } from "@platform/core";
import { BillingLimitError, FREE_TIER } from "@platform/billing";
import { signSamlSession, verifySamlSession } from "@platform/auth";
import { auditLineToJsonl, type AuditLine } from "@platform/db";
import { readFile } from "node:fs/promises";
import { parseAgentSubdomain } from "@platform/config";
import supportTriage from "../examples/support-triage/agent.config";
import cases from "../examples/support-triage/evals/cases.json" with { type: "json" };

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("✗ FAIL:", msg); process.exit(1); }
  console.log("✓", msg);
}

async function main() {
  const platform = await buildPlatform({ ...process.env, GATEWAY: "local", RUNTIME: "local", DURABLE: "local" });
  const orgId = "org_smoke";
  platform.registry.register(supportTriage, orgId);
  const budget = await platform.resolveBudget(orgId);

  // 1. surface selector
  assert(enabledSurfaces(supportTriage).length === 4, "agent exposes 4 surfaces");
  assert(supportTriage.public === true, "example agent is public playground");
  const pub = findPublicAgentInRegistry(platform.registry, supportTriage.slug);
  assert(pub?.orgId === orgId, "public agent resolvable in registry");
  assert(
    platform.registry.get(supportTriage.slug, "org_other") === undefined,
    "agents are org-scoped in registry",
  );

  // 2. dispatch a run through the single funnel (as the HTTP surface would)
  const run = await platform.dispatch({
    agent: supportTriage,
    input: { message: "I was charged twice for my invoice" },
    source: "http",
    orgId,
    budget,
  });
  assert(run.status === "succeeded", "run succeeded");
  assert((run.output as any).category === "billing", "billing message classified as billing");
  assert(typeof run.costUsd === "number", "run records cost");

  // 3. trace replay is populated (append-only events)
  const events = await platform.trace.list(run.runId);
  assert(events.some((e) => e.type === "run.start"), "trace has run.start");
  assert(events.some((e) => e.type === "llm_call"), "trace has llm_call span");
  assert(events.some((e) => e.type === "run.succeeded"), "trace has run.succeeded");

  // 4. connect snippets derived per enabled surface
  const snippets = connectSnippets(supportTriage, platform.config.PLATFORM_BASE_URL);
  assert(snippets.mcp && snippets.cli && snippets.http && snippets.playground, "connect snippets for all surfaces");

  const hosted = buildAgentUrls({
    slug: supportTriage.slug,
    apiBaseUrl: "https://api.agentd.dev",
    webBaseUrl: "https://app.agentd.dev",
    platformDomain: "agentd.dev",
  });
  assert(hosted.playground === "https://support-triage.agentd.dev", "wildcard playground URL");
  const sub = parseAgentSubdomain("support-triage.agentd.dev", "agentd.dev");
  assert(sub?.slug === "support-triage", "parse agent subdomain");

  // 4b. MCP streamable HTTP accepts initialize (stateless transport)
  const mcpInit = await handleMcpHttp(
    supportTriage,
    { dispatch: platform.dispatch, orgId, budget },
    new Request("http://localhost/mcp/support-triage", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "smoke", version: "1.0.0" },
        },
      }),
    }),
  );
  assert(mcpInit.ok, "MCP initialize returns 2xx");
  const mcpBody = await mcpInit.json() as { result?: { serverInfo?: { name?: string } } };
  assert(mcpBody.result?.serverInfo?.name === supportTriage.slug, "MCP server exposes agent slug");

  // 4c. SSE stream emits trace + token events
  const streamEvents: { event: string }[] = [];
  await streamAgentRun({
    dispatch: platform.dispatch,
    trace: platform.trace,
    agent: supportTriage,
    input: { message: "hello stream" },
    orgId,
    source: "playground",
    budget,
    onEvent: (event) => streamEvents.push({ event }),
  });
  assert(streamEvents.some((e) => e.event === "trace"), "stream emits trace events");
  assert(streamEvents.some((e) => e.event === "token"), "stream emits token events");
  assert(streamEvents.some((e) => e.event === "done"), "stream emits done");

  // 5. budget circuit breaker fires
  const capped = await platform.dispatch({
    agent: supportTriage,
    input: { message: "x" },
    source: "http",
    orgId,
    budget: { perRunCapUsd: -1, monthlyCapUsd: 999, hardStop: true }, // impossible cap -> must trip
  });
  assert(capped.status === "failed", "budget circuit breaker stops over-cap run");

  // 5b. monthly org cap blocks further runs (separate org so later tests stay under cap)
  const monthlyOrg = "org_smoke_monthly";
  platform.registry.register(supportTriage, monthlyOrg);
  const monthlyCap = await platform.resolveBudget(monthlyOrg);
  await platform.budgetStore.addSpend(monthlyOrg, monthlyCap.monthlyCapUsd);
  const monthlyBlocked = await platform.dispatch({
    agent: supportTriage,
    input: { message: "over monthly cap" },
    source: "http",
    orgId: monthlyOrg,
    budget: monthlyCap,
  });
  assert(monthlyBlocked.status === "failed", "monthly org budget blocks over-cap run");

  // 5c. project secrets round-trip (never in trace payloads)
  const projectId = "proj_smoke_secrets";
  await platform.secretsStore.upsert(projectId, "API_TOKEN", "smoke-secret-value");
  const loaded = await platform.secretsStore.loadForProject(projectId);
  assert(loaded.API_TOKEN === "smoke-secret-value", "secrets store round-trip");
  const secretRun = await platform.dispatch({
    agent: supportTriage,
    input: { message: "secrets test" },
    source: "http",
    orgId,
    budget,
    projectId,
  });
  assert(secretRun.status === "succeeded", "run with project secrets succeeds");
  const secretEvents = await platform.trace.list(secretRun.runId);
  const traceBlob = JSON.stringify(secretEvents);
  assert(!traceBlob.includes("smoke-secret-value"), "secrets never appear in run_events");

  // 6. evals run through the same dispatcher
  const results = await runEvals(supportTriage, cases as any, { dispatch: platform.dispatch, orgId, budget });
  assert(results.every((r) => r.passed), `evals pass (${results.length} cases)`);

  // 6b. P10: eval regression gate
  const baseline = new Map(results.map((r) => [r.name, 1]));
  const regressed = checkEvalGate(
    [{ name: "billing question", passed: true, score: 0.5 }],
    baseline,
    0.05,
  );
  assert(!regressed.passed, "eval gate blocks score regression vs baseline");
  const okGate = checkEvalGate(results, baseline, 0.05);
  assert(okGate.passed, "eval gate passes when scores match baseline");

  // 6c. P10: trace export wrapper delegates to inner store
  const inner = new InMemoryTraceStore();
  const wrapped = new ExportingTraceStore(inner, []);
  await wrapped.beginRun?.({ runId: "exp-1", orgId, source: "http" });
  await wrapped.append({
    id: "e1",
    runId: "exp-1",
    type: "run.start",
    payload: { ok: true },
    ts: Date.now(),
  });
  assert((await wrapped.list("exp-1")).length === 1, "exporting trace store wraps inner store");

  // 7. P11: framework detect + import adapter generates agent.config.ts
  const lgRoot = join(process.cwd(), "examples/adapters/langgraph-minimal");
  const lgInfo = await detectFrameworkInfo(lgRoot);
  assert(lgInfo.framework === "langgraph", "detects LangGraph from package.json");
  const lgPlan = await planFrameworkImport(lgRoot);
  assert(lgPlan?.entryPath != null, "LangGraph adapter finds entry path");
  const lgAgentd = await writeAdaptedAgent(lgRoot, lgPlan!);
  const lgConfig = await readFile(join(lgAgentd, "agent.config.ts"), "utf8");
  assert(lgConfig.includes("defineAgent"), "adapter writes defineAgent manifest");
  assert(lgConfig.includes("langgraph"), "generated config notes framework");

  const tmpAdapt = await mkdtemp(join(tmpdir(), "agentd-vercel-ai-"));
  try {
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        join(tmpAdapt, "package.json"),
        JSON.stringify({ dependencies: { ai: "4.0.0" } }),
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(join(tmpAdapt, "src"), { recursive: true }),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        join(tmpAdapt, "src", "agent.ts"),
        `import { generateText } from "ai";\nexport async function runAgent() { return { reply: "ok" }; }\n`,
      ),
    );
    const aiInfo = await detectFrameworkInfo(tmpAdapt);
    assert(aiInfo.framework === "vercel-ai", "detects Vercel AI SDK");
  } finally {
    await rm(tmpAdapt, { recursive: true, force: true });
  }

  // 8. P12: MCP server card + Claude deep link + public directory
  const mcpCard = buildMcpServerCard(
    supportTriage,
    platform.config.PLATFORM_BASE_URL,
    platform.config.WEB_BASE_URL,
  );
  assert(mcpCard.tools.length === 1, "MCP card exposes one tool");
  assert(mcpCard.tools[0]!.examplePrompt.includes("support"), "MCP card has example prompt");
  assert(mcpCard.claudeDeepLink.startsWith("claude://"), "Claude Desktop deep link");
  assert(mcpCard.configJson.includes("mcpServers"), "MCP config JSON for Claude");
  const directory = listDirectoryAgents(platform.registry);
  assert(directory.some((d) => d.agent.slug === supportTriage.slug), "public agent in directory");

  // 9. P1: artifact build + GitHub signature verification
  const { createHmac } = await import("node:crypto");
  const payload = "smoke-webhook-body";
  const sig =
    "sha256=" + createHmac("sha256", "smoke-secret").update(payload).digest("hex");
  assert(verifyGitHubSignature(payload, sig, "smoke-secret"), "GitHub HMAC accepts valid sig");
  assert(!verifyGitHubSignature(payload, sig, "wrong-secret"), "GitHub HMAC rejects bad secret");

  const tmp = await mkdtemp(join(tmpdir(), "agentd-smoke-"));
  try {
    const built = await buildFromLocalPath({
      deploymentId: "smoke-deploy",
      artifactsDir: tmp,
      sourceDir: join(process.cwd(), "examples/support-triage"),
    });
    assert(built.agent.slug === "support-triage", "artifact build loads agent from copy");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  // 10. P7: mock E2B — handler in subprocess, ctx.llm/trace bridged to platform
  const e2bPlatform = await buildPlatform({
    ...process.env,
    GATEWAY: "local",
    RUNTIME: "e2b",
    E2B_MOCK: "true",
    DURABLE: "local",
  });
  e2bPlatform.registry.register(supportTriage, orgId);
  const e2bBudget = await e2bPlatform.resolveBudget(orgId);
  const e2bRun = await e2bPlatform.dispatch({
    agent: supportTriage,
    input: { message: "mock e2b subprocess isolation" },
    source: "http",
    orgId,
    budget: e2bBudget,
    snapshotRef: join(process.cwd(), "examples/support-triage"),
  });
  assert(e2bRun.status === "succeeded", "mock E2B run succeeded");
  const e2bEvents = await e2bPlatform.trace.list(e2bRun.runId);
  assert(
    e2bEvents.some(
      (e) => e.type === "runtime.sandbox" && (e.payload as { provider?: string }).provider === "e2b-mock",
    ),
    "mock E2B records sandbox provider",
  );
  assert(e2bEvents.some((e) => e.type === "llm.token"), "mock E2B bridges llm to platform");

  // 9. P9: async run queue + poll (in-process background when no Inngest keys)
  const asyncRunId = randomUUID();
  await platform.trace.beginRun?.({
    runId: asyncRunId,
    orgId,
    source: "http",
    agentSlug: supportTriage.slug,
    input: { message: "async poll test" },
    status: "queued",
  });
  enqueueBackground(async () => {
    await platform.trace.updateRunStatus?.(asyncRunId, "running");
    await platform.dispatch({
      agent: supportTriage,
      input: { message: "async poll test" },
      source: "http",
      orgId,
      idempotencyKey: asyncRunId,
      budget,
    });
  });
  let polled = await platform.trace.getRun?.(asyncRunId);
  for (let i = 0; i < 80 && polled?.status !== "succeeded"; i++) {
    await new Promise((r) => setTimeout(r, 50));
    polled = await platform.trace.getRun?.(asyncRunId);
  }
  assert(polled?.status === "succeeded", "async run is pollable until succeeded");
  assert(typeof platform.trace.getRun === "function", "trace store exposes getRun");

  // 11. P13: free tier monthly run cap (no Stripe keys required)
  const freeOrg = "org_smoke_free_tier";
  for (let i = 0; i < FREE_TIER.runsPerMonth; i++) {
    await platform.billing.recordRunStarted(freeOrg);
  }
  let blocked = false;
  try {
    await platform.billing.assertCanRun(freeOrg);
  } catch (e) {
    blocked = e instanceof BillingLimitError && e.code === "runs_exceeded";
  }
  assert(blocked, "free tier blocks runs after monthly limit");
  const billingOverview = await platform.billing.getOverview(freeOrg);
  assert(billingOverview.plan === "free", "new org defaults to free plan");
  assert(
    billingOverview.runsThisPeriod >= FREE_TIER.runsPerMonth,
    "billing tracks runs this period",
  );

  // 12. P14: SAML session + audit JSONL format
  const samlToken = signSamlSession(
    { sub: "smoke-user", orgId: "org_saml_smoke" },
    "smoke-saml-secret",
    3600,
  );
  const samlPayload = verifySamlSession(samlToken, "smoke-saml-secret");
  assert(samlPayload?.orgId === "org_saml_smoke", "SAML session token round-trip");
  const auditSample: AuditLine = {
    kind: "run",
    runId: "r1",
    orgId: "org_saml_smoke",
    agentSlug: "support-triage",
    status: "succeeded",
    source: "http",
    costUsd: 0,
    tokens: 0,
    durationMs: 10,
    createdAt: new Date().toISOString(),
    input: {},
    output: {},
  };
  const line = auditLineToJsonl(auditSample);
  assert(line.includes('"kind":"run"'), "audit export JSONL line format");

  console.log("\nSMOKE GREEN — spine works end to end.");
}

main().catch((e) => { console.error(e); process.exit(1); });
