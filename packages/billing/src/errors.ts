export class BillingLimitError extends Error {
  constructor(
    message: string,
    public readonly code: "runs_exceeded" | "plan_required" | "past_due" = "runs_exceeded",
  ) {
    super(message);
    this.name = "BillingLimitError";
  }
}

/** HTTP mapping used by apps/api (402 Payment Required). */
export function billingHttpStatus(err: unknown): 402 | null {
  return err instanceof BillingLimitError ? 402 : null;
}
