/**
 * End-to-end smoke test = the platform's guarantee. Boots in LOCAL mode (no vendor accounts),
 * registers the example agent, exercises the dispatcher + surface selector + budget + evals,
 * and prints the trace. If this is green, the spine works.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildPlatform,
  connectSnippets,
  enabledSurfaces,
  streamAgentRun,
  findPublicAgentInRegistry,
} from "@platform/core";
import { runEvals } from "@platform/evals";
import { handleMcpHttp } from "@platform/mcp";
import { verifyGitHubSignature, buildFromLocalPath, buildAgentUrls } from "@platform/build";
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

  // 7. P1: artifact build + GitHub signature verification
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

  // 8. P7: mock E2B — handler in subprocess, ctx.llm/trace bridged to platform
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

  console.log("\nSMOKE GREEN — spine works end to end.");
}

main().catch((e) => { console.error(e); process.exit(1); });
