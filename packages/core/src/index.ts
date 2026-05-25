import { loadConfig, type Config } from "@platform/config";
import { AgentRegistry } from "./registry";
import {
  createDb,
  DeployService,
  PostgresTraceStore,
  recordUsage,
  BudgetStore,
  SecretsStore,
  type Database,
} from "@platform/db";
import { InMemoryTraceStore, type TraceStore } from "@platform/trace";
import { createGateway, type Budget } from "@platform/gateway";
import {
  createRuntimeBundle,
  parseEgressAllowlist,
  type BridgeRegistry,
} from "@platform/runtime";
import { createDurableEngine } from "@platform/durable";
import { createDispatcher, type Dispatch, type RunResult } from "./dispatcher";
import type { RunSource } from "@platform/sdk";

export * from "./dispatcher";
export * from "./surfaces";
export * from "./hydrate";
export { AgentRegistry } from "./registry";
export { IpRateLimiter, clientIp } from "./rate-limit";
export { streamAgentRun } from "./stream-run";
export { sseResponse } from "./sse";
export { findPublicAgentInRegistry, resolvePublicAgent } from "./public-agent";

export interface Platform {
  config: Config;
  registry: AgentRegistry;
  dispatch: Dispatch;
  trace: TraceStore;
  db?: Database;
  deploy?: DeployService;
  bridgeRegistry: BridgeRegistry;
  bridgeSecret: string;
  budgetStore: BudgetStore;
  secretsStore: SecretsStore;
  resolveBudget: (orgId: string) => Promise<Budget>;
}

function createTraceStore(config: Config, db?: Database): TraceStore {
  if (config.TRACE_STORE === "postgres") {
    if (!db) throw new Error("DATABASE_URL required for TRACE_STORE=postgres");
    return new PostgresTraceStore(db);
  }
  return new InMemoryTraceStore();
}

/** Wire every adapter from config (local-by-default) and return the running platform. */
export async function buildPlatform(env: NodeJS.ProcessEnv = process.env): Promise<Platform> {
  const config = loadConfig(env);
  const db = config.DATABASE_URL ? createDb(config.DATABASE_URL) : undefined;
  const trace = createTraceStore(config, db);
  const budgetStore = new BudgetStore(db, {
    monthlyCapUsd: config.DEFAULT_ORG_MONTHLY_USD_CAP,
    perRunCapUsd: config.DEFAULT_PER_RUN_USD_CAP,
  });
  const secretsStore = new SecretsStore(db, config.SECRETS_ENCRYPTION_KEY);
  const gateway = createGateway(config.GATEWAY, budgetStore);
  const mockE2b =
    config.E2B_MOCK === "true" ||
    config.E2B_MOCK === "1" ||
    (config.RUNTIME === "e2b" && !config.E2B_API_KEY);
  const runtimeBundle = await createRuntimeBundle({
    mode: config.RUNTIME,
    apiKey: config.E2B_API_KEY,
    mockE2b,
    bridgeUrl: config.PLATFORM_BASE_URL,
    bridgeSecret: config.BRIDGE_SECRET,
    e2bTemplateId: config.E2B_TEMPLATE_ID,
    egressAllowlist: parseEgressAllowlist(config.DEFAULT_EGRESS_ALLOWLIST),
    repoRoot: env.AGENTD_ROOT ?? process.cwd(),
  });
  const durable = createDurableEngine(config.DURABLE, { db: !!db });
  const registry = new AgentRegistry();
  const deploy = db
    ? new DeployService(
        db,
        config.PLATFORM_BASE_URL,
        config.WEB_BASE_URL,
        config.ARTIFACTS_DIR,
        config.PLATFORM_DOMAIN,
        config.DEPLOY_ENV === "staging" ? "staging" : "production",
      )
    : undefined;

  const onRunComplete = async (r: RunResult & { source: RunSource; orgId: string }) => {
    await trace.completeRun?.({
      runId: r.runId,
      orgId: r.orgId,
      source: r.source,
      status: r.status,
      output: r.output,
      error: r.error,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
    });
    console.log(`[run] ${r.runId} ${r.status} source=${r.source} cost=$${r.costUsd.toFixed(4)}`);
  };

  const dispatch = createDispatcher({
    runtime: runtimeBundle.runtime,
    durable,
    gateway,
    trace,
    bridgeRegistry: runtimeBundle.bridgeRegistry,
    defaultEgressAllowlist: parseEgressAllowlist(config.DEFAULT_EGRESS_ALLOWLIST),
    loadSecrets: async (projectId) => secretsStore.loadForProject(projectId),
    onUsage: async ({ runId, orgId, usage }) => {
      await budgetStore.addSpend(orgId, usage.costUsd);
      if (db) await recordUsage(db, { runId, orgId, usage });
    },
    onRunComplete,
  });

  return {
    config,
    registry,
    dispatch,
    trace,
    db,
    deploy,
    bridgeRegistry: runtimeBundle.bridgeRegistry,
    bridgeSecret: config.BRIDGE_SECRET,
    budgetStore,
    secretsStore,
    resolveBudget: (orgId: string) => budgetStore.resolveBudget(orgId),
  };
}

export function defaultBudget(config: Config): Budget {
  return {
    perRunCapUsd: config.DEFAULT_PER_RUN_USD_CAP,
    monthlyCapUsd: config.DEFAULT_ORG_MONTHLY_USD_CAP,
    hardStop: true,
  };
}

export function publicBudget(config: Config): Budget {
  return {
    perRunCapUsd: config.PUBLIC_PER_RUN_USD_CAP,
    monthlyCapUsd: config.PUBLIC_PER_RUN_USD_CAP,
    hardStop: true,
  };
}
