CREATE TABLE IF NOT EXISTS "org_members" (
  "org_id" text NOT NULL REFERENCES "orgs"("id"),
  "user_id" text NOT NULL,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("org_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL REFERENCES "orgs"("id"),
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hash_idx" ON "api_keys" ("key_hash");
