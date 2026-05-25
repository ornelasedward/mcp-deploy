CREATE TABLE IF NOT EXISTS org_billing (
  org_id text PRIMARY KEY REFERENCES orgs(id),
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  runs_this_period integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS org_billing_stripe_customer_idx
  ON org_billing (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
