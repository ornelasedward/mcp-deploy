export class BillingLimitError extends Error {
  constructor(
    message: string,
    public readonly code: "runs_exceeded" | "plan_required" | "past_due" = "runs_exceeded",
  ) {
    super(message);
    this.name = "BillingLimitError";
  }
}
