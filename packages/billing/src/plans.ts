import type { Surface } from "@platform/sdk";

/** Free tier limits (P13). */
export const FREE_TIER = {
  plan: "free" as const,
  runsPerMonth: 100,
  /** All surfaces allowed on free; upgrade for higher run caps + Stripe invoicing. */
  maxSurfaces: 4,
};

export const PRO_PLAN = {
  plan: "pro" as const,
  runsPerMonth: Number.POSITIVE_INFINITY,
  maxSurfaces: 4,
};

export function isProPlan(plan: string, status: string): boolean {
  return plan === "pro" && (status === "active" || status === "trialing");
}

export function surfaceCount(surfaces: string[]): number {
  return surfaces.length;
}

export function assertSurfacesAllowed(plan: string, surfaces: Surface[]): void {
  const max = plan === "pro" ? PRO_PLAN.maxSurfaces : FREE_TIER.maxSurfaces;
  if (surfaces.length > max) {
    throw new Error(`Plan allows at most ${max} surfaces`);
  }
}
