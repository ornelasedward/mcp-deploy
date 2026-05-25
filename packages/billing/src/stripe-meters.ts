import type Stripe from "stripe";

/**
 * Report LLM pass-through cost using Stripe Billing Meters API (replaces legacy usage records).
 * @see https://docs.stripe.com/api/billing/meter-event/create
 */
export async function reportLlmMeterEvent(
  stripe: Stripe,
  opts: {
    eventName: string;
    stripeCustomerId: string;
    costUsd: number;
    runId: string;
    timestamp?: number;
  },
): Promise<void> {
  if (opts.costUsd <= 0) return;

  // Meter values are integers — report micro-dollars (1 USD = 1_000_000 units).
  const microUsd = Math.max(1, Math.round(opts.costUsd * 1_000_000));

  await stripe.billing.meterEvents.create({
    event_name: opts.eventName,
    payload: {
      stripe_customer_id: opts.stripeCustomerId,
      value: String(microUsd),
    },
    identifier: `${opts.runId}:llm`,
    timestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
  });
}

/** Human-readable cost from meter event value. */
export function microUsdToDollars(microUsd: number): number {
  return microUsd / 1_000_000;
}
