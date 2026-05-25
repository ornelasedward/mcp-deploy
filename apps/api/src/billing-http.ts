import type { Context } from "hono";
import { BillingLimitError } from "@platform/billing";

/** Map billing gate failures to HTTP 402 (hono-api rule). */
export function billingLimitResponse(c: Context, err: unknown): Response | null {
  if (err instanceof BillingLimitError) {
    return c.json({ error: err.message, code: err.code }, 402);
  }
  return null;
}
