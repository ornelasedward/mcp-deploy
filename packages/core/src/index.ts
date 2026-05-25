import { loadConfig, type Config } from "@platform/config";
import { AgentRegistry } from "./registry";
import {
  createDb,
  DeployService,
  PostgresTraceStore,
  recordUsage,
  BudgetStore,
  BillingStore,
  SecretsStore,
  type Database,
} from "@platform/db";
import { BillingService } from "@platform/billing";
import {
  ExportingTraceStore,
  InMemoryTraceStore,
  LangfuseExporter,
  OtelExporter,
  type TraceStore,
} from "@platform/trace";
import { createGateway, type Budget } from "@platform/gateway";
import {
  createRuntimeBundle,
  parseEgressAllowlist,
  type BridgeRegistry,
} from "@platform/runtime";
import { createDurableEngine, enqueueBackground } from "@platform/durable";
import { createDispatcher, type Dispatch, type RunResult } from "./dispatcher";
import type { RunSource } from "@platform/sdk";

export * from "./dispatcher";
export type { DispatchOptions } from "./dispatcher";
export * from "./surfaces";
export * from "./hydrate";
export { AgentRegistry } from "./registry";
export { IpRateLimiter, clientIp } from "./rate-limit";
export { streamAgentRun } from "./stream-run";
export { sseResponse } from "./sse";
export { findPublicAgentInRegistry, resolvePublicAgent, listDirectoryAgents } from "./public-agent";
export { enqueueBackground };
export { checkEvalGate } from "@platform/evals";
export { ExportingTraceStore, InMemoryTraceStore } from "@platform/trace";

export interface Platform {
  config: Config;
  registry: AgentRegistry;
  dispatch: Dispatch;
  gateway: import("@platform/gateway").Gateway;
  trace: TraceStore;
  db?: Database;
  deploy?: DeployService;
  bridgeRegistry: BridgeRegistry;
  bridgeSecret: string;
  budgetStore: BudgetStore;
  billingStore: BillingStore;
  billing: BillingService;
  secretsStore: SecretsStore;
  resolveBudget: (orgId: string) => Promise<Budget>;
}

function createTraceStore(config: Config, db?: Database): TraceStore {
  const inner =
    config.TRACE_STORE === "postgres"
      ? (() => {
          if (!db) throw new Error("DATABASE_URL required for TRACE_STORE=postgres");
          return new PostgresTraceStore(db);
        })()
      : new InMemoryTraceStore();

  const exporters = [];
  if (config.TRACE_EXPORT === "langfuse") {
    if (!config.LANGFUSE_PUBLIC_KEY || !config.LANGFUSE_SECRET_KEY) {
      throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY required for TRACE_EXPORT=langfuse");
    }
    exporters.push(
      new LangfuseExporter({
        publicKey: config.LANGFUSE_PUBLIC_KEY,
        secretKey: config.LANGFUSE_SECRET_KEY,
        baseUrl: config.LANGFUSE_BASE_URL,
      }),
    );
  }
  if (config.TRACE_EXPORT === "otel") {
    if (!config.OTEL_EXPORTER_OTLP_ENDPOINT) {
      throw new Error("OTEL_EXPORTER_OTLP_ENDPOINT required for TRACE_EXPORT=otel");
    }
    exporters.push(
      new OtelExporter({
        endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
        serviceName: "agentd",
      }),
    );
  }

  return exporters.length > 0 ? new ExportingTraceStore(inner, exporters) : inner;
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
  const billingStore = new BillingStore(db);
  const billing = new BillingService({ config, store: billingStore });
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
    beforeRun: async (req) => {
      await billing.assertCanRun(req.orgId, req.agent.distribute);
      await billing.recordRunStarted(req.orgId);
    },
    onUsage: async ({ runId, orgId, usage }) => {
      await budgetStore.addSpend(orgId, usage.costUsd);
      if (db) await recordUsage(db, { runId, orgId, usage });
      await billing.recordLlmUsage(orgId, runId, usage.costUsd);
    },
    onRunComplete,
  });

  return {
    config,
    registry,
    dispatch,
    gateway,
    trace,
    db,
    deploy,
    bridgeRegistry: runtimeBundle.bridgeRegistry,
    bridgeSecret: config.BRIDGE_SECRET,
    budgetStore,
    billingStore,
    billing,
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
