ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "agent_slug" text;
CREATE INDEX IF NOT EXISTS "runs_org_agent_slug_idx" ON "runs" ("org_id", "agent_slug");
