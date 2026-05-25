# Stripe billing setup (P13)

Agentd uses **Stripe Billing Meters** (`billing.meterEvents.create`) for LLM pass-through costs — not legacy `subscription_items.usage_records` (removed in API version Basil).

## 1. Create a Billing Meter (LLM cost)

In [Stripe Dashboard → Billing → Meters](https://dashboard.stripe.com/billing/meters) or via API:

```bash
stripe billing meters create \
  --display-name="Agentd LLM usage" \
  --event-name=agentd_llm_usage \
  --customer-mapping='{"type":"by_id","event_payload_key":"stripe_customer_id"}' \
  --value-settings='{"event_payload_key":"value"}'
```

Set `STRIPE_METER_LLM_EVENT=agentd_llm_usage` (must match `event_name`).

Values are **micro-dollars** (1 USD = 1,000,000) so invoices can show fractional model cost.

## 2. Prices

1. **Platform fee** — recurring licensed price (e.g. $29/mo). Set `STRIPE_PRICE_PLATFORM_MONTHLY`.
2. **LLM pass-through** — recurring price with `usage_type=metered`, linked to the meter above. Set `STRIPE_PRICE_LLM_METERED`.

Checkout creates a subscription with **two line items** → separate invoice lines for platform fee vs model usage.

## 3. Webhooks

```bash
stripe listen --forward-to localhost:8787/v1/webhooks/stripe
```

Set `STRIPE_WEBHOOK_SECRET` from the CLI output. Subscribe to:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## 4. Environment

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PLATFORM_MONTHLY=price_...
STRIPE_PRICE_LLM_METERED=price_...
STRIPE_METER_LLM_EVENT=agentd_llm_usage
BILLING_ENABLED=true
```

## References

- [Meter Events API](https://docs.stripe.com/api/billing/meter-event/create)
- [Usage-based billing](https://docs.stripe.com/billing/subscriptions/usage-based)
- [Customer Portal](https://docs.stripe.com/customer-management/portal)
