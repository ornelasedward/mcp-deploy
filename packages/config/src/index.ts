import { z } from "zod";

export * from "./host";

const Env = z.object({
  RUNTIME: z.enum(["local", "e2b"]).default("local"),
  DURABLE: z.enum(["local", "inngest"]).default("local"),
  GATEWAY: z.enum(["local", "live"]).default("local"),
  TRACE_STORE: z.enum(["memory", "postgres"]).default("memory"),
  /** Export run_events to Langfuse or OTel (in addition to local trace store). */
  TRACE_EXPORT: z.enum(["none", "langfuse", "otel"]).default("none"),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().default("https://cloud.langfuse.com"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  /** Max score drop vs production baseline before deploy is blocked. */
  EVAL_REGRESSION_DELTA: z.coerce.number().default(0.05),
  EVAL_BLOCK_DEPLOY: z.coerce.boolean().default(true),

  DATABASE_URL: z.string().optional(),
  E2B_API_KEY: z.string().optional(),
  E2B_TEMPLATE_ID: z.string().optional(),
  /** Set to `true` for subprocess-isolated mock E2B (CI, no E2B account). */
  E2B_MOCK: z.string().optional(),
  BRIDGE_SECRET: z.string().default("dev-bridge"),
  DEFAULT_EGRESS_ALLOWLIST: z.string().default("api.anthropic.com,api.openai.com"),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  PLATFORM_BASE_URL: z.string().default("http://localhost:8787"),
  WEB_BASE_URL: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(8787),

  API_KEY: z.string().optional(),
  /** dev | clerk | keys | mixed — how the API authenticates callers. */
  AUTH_MODE: z.enum(["dev", "clerk", "keys", "mixed"]).default("mixed"),
  CLERK_SECRET_KEY: z.string().optional(),
  DEFAULT_ORG_ID: z.string().default("org_dev"),
  AGENTS_DIR: z.string().optional(),

  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  /** PAT or GitHub App token for cloning private repos. */
  GITHUB_TOKEN: z.string().optional(),
  /** Immutable agent artifacts (git clones + local copies). */
  ARTIFACTS_DIR: z.string().default(".artifacts"),

  DEFAULT_PER_RUN_USD_CAP: z.coerce.number().default(0.5),
  DEFAULT_ORG_MONTHLY_USD_CAP: z.coerce.number().default(50),
  /** AES key material for project_secrets at rest (32+ chars recommended). */
  SECRETS_ENCRYPTION_KEY: z.string().optional(),

  /** Anonymous playground runs per IP per hour. */
  PUBLIC_RATE_LIMIT_PER_HOUR: z.coerce.number().default(30),
  /** Tighter per-run cap for anonymous public playground runs. */
  PUBLIC_PER_RUN_USD_CAP: z.coerce.number().default(0.05),

  /** e.g. agentd.dev — enables wildcard agent subdomains in URL builder + web middleware. */
  PLATFORM_DOMAIN: z.string().optional(),
  DEPLOY_ENV: z.enum(["development", "staging", "production"]).default("development"),
});

export type Config = z.infer<typeof Env>;

/** Fail fast on misconfiguration. Validates once at boot. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  const config = parsed.data;
  if (config.TRACE_STORE === "postgres" && !config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when TRACE_STORE=postgres");
  }
  if (source.NODE_ENV === "production") {
    if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
    const hasClerk = Boolean(config.CLERK_SECRET_KEY);
    if (!config.API_KEY && config.AUTH_MODE !== "clerk" && !hasClerk) {
      throw new Error("API_KEY or CLERK_SECRET_KEY is required in production");
    }
  }
  return config;
}
