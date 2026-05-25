CREATE TABLE IF NOT EXISTS "orgs" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL REFERENCES "orgs"("id"),
  "repo" text NOT NULL,
  "default_branch" text DEFAULT 'main' NOT NULL,
  "framework" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "deployments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "commit_sha" text NOT NULL,
  "status" text NOT NULL,
  "snapshot_ref" text,
  "manifest" jsonb NOT NULL,
  "is_preview" boolean DEFAULT false NOT NULL,
  "pr_number" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "deploy_commit_idx" ON "deployments" ("project_id", "commit_sha");

CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "input_schema" jsonb NOT NULL,
  "output_schema" jsonb NOT NULL,
  "distribute" jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_slug_idx" ON "agents" ("project_id", "slug");

CREATE TABLE IF NOT EXISTS "runs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "orgs"("id"),
  "deployment_id" uuid REFERENCES "deployments"("id"),
  "agent_id" uuid REFERENCES "agents"("id"),
  "status" text NOT NULL,
  "source" text NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "cost_usd" double precision DEFAULT 0 NOT NULL,
  "tokens" integer DEFAULT 0 NOT NULL,
  "duration_ms" integer,
  "idempotency_key" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "run_idem_idx" ON "runs" ("idempotency_key");

CREATE TABLE IF NOT EXISTS "run_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "runs"("id"),
  "parent_id" uuid,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "duration_ms" integer,
  "ts" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "event_run_idx" ON "run_events" ("run_id");

CREATE TABLE IF NOT EXISTS "budgets" (
  "org_id" text PRIMARY KEY NOT NULL REFERENCES "orgs"("id"),
  "monthly_cap_usd" double precision NOT NULL,
  "per_run_cap_usd" double precision NOT NULL,
  "hard_stop" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL REFERENCES "orgs"("id"),
  "run_id" uuid REFERENCES "runs"("id"),
  "tokens" integer NOT NULL,
  "cost_usd" double precision NOT NULL,
  "ts" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "eval_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deployment_id" uuid NOT NULL REFERENCES "deployments"("id"),
  "case_name" text NOT NULL,
  "score" double precision NOT NULL,
  "passed" boolean NOT NULL,
  "baseline_score" double precision,
  "output" jsonb
);
