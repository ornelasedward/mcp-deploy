CREATE TABLE IF NOT EXISTS project_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
