import {
  pgTable, text, timestamp, integer, jsonb, boolean, doublePrecision, uuid, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";

export const orgs = pgTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgMembers = pgTable("org_members", {
  orgId: text("org_id").notNull().references(() => orgs.id),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // owner | member | viewer
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.userId] }) }));

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  role: text("role").notNull(), // owner | member | viewer
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => ({ byHash: uniqueIndex("api_keys_hash_idx").on(t.keyHash) }));

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id),
  repo: text("repo").notNull(),
  defaultBranch: text("default_branch").default("main").notNull(),
  framework: text("framework"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deployments = pgTable("deployments", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  commitSha: text("commit_sha").notNull(),
  status: text("status").notNull(), // queued|building|live|failed
  snapshotRef: text("snapshot_ref"),
  manifest: jsonb("manifest").notNull(),
  isPreview: boolean("is_preview").default(false).notNull(),
  prNumber: integer("pr_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ byCommit: uniqueIndex("deploy_commit_idx").on(t.projectId, t.commitSha) }));

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  inputSchema: jsonb("input_schema").notNull(),
  outputSchema: jsonb("output_schema").notNull(),
  distribute: jsonb("distribute").notNull(), // Surface[]
  publicPlayground: boolean("public_playground").default(false).notNull(),
  handlerPath: text("handler_path"),
}, (t) => ({ bySlug: uniqueIndex("agent_slug_idx").on(t.projectId, t.slug) }));

export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id),
  deploymentId: uuid("deployment_id").references(() => deployments.id),
  agentId: uuid("agent_id").references(() => agents.id),
  agentSlug: text("agent_slug"),
  status: text("status").notNull(), // running|succeeded|failed|suspended
  source: text("source").notNull(), // http|mcp|cli|playground|eval
  input: jsonb("input"),
  output: jsonb("output"),
  costUsd: doublePrecision("cost_usd").default(0).notNull(),
  tokens: integer("tokens").default(0).notNull(),
  durationMs: integer("duration_ms"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ byIdem: uniqueIndex("run_idem_idx").on(t.idempotencyKey) }));

// Append-only. Source of truth for trace replay.
export const runEvents = pgTable("run_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  parentId: uuid("parent_id"),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  durationMs: integer("duration_ms"),
  ts: timestamp("ts").defaultNow().notNull(),
}, (t) => ({ byRun: index("event_run_idx").on(t.runId) }));

export const orgBilling = pgTable("org_billing", {
  orgId: text("org_id").primaryKey().references(() => orgs.id),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  runsThisPeriod: integer("runs_this_period").notNull().default(0),
  periodStart: timestamp("period_start").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byCustomer: uniqueIndex("org_billing_stripe_customer_idx").on(t.stripeCustomerId),
}));

export const budgets = pgTable("budgets", {
  orgId: text("org_id").primaryKey().references(() => orgs.id),
  monthlyCapUsd: doublePrecision("monthly_cap_usd").notNull(),
  perRunCapUsd: doublePrecision("per_run_cap_usd").notNull(),
  hardStop: boolean("hard_stop").default(true).notNull(),
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id),
  runId: uuid("run_id").references(() => runs.id),
  tokens: integer("tokens").notNull(),
  costUsd: doublePrecision("cost_usd").notNull(),
  ts: timestamp("ts").defaultNow().notNull(),
});

export const projectSecrets = pgTable("project_secrets", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ byName: uniqueIndex("project_secret_name_idx").on(t.projectId, t.name) }));

export const evalResults = pgTable("eval_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  deploymentId: uuid("deployment_id").notNull().references(() => deployments.id),
  caseName: text("case_name").notNull(),
  score: doublePrecision("score").notNull(),
  passed: boolean("passed").notNull(),
  baselineScore: doublePrecision("baseline_score"),
  output: jsonb("output"),
});
