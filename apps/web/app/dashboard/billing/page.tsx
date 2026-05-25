import Link from "next/link";
import { apiFetch, devOrgId } from "../../../lib/api-server";
import { BillingActions } from "../../../components/billing-actions";

type BillingOverview = {
  plan: string;
  status: string;
  runsThisPeriod: number;
  runsLimit: number;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  canUpgrade: boolean;
  billingEnabled: boolean;
  freeTierRunsPerMonth: number;
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const orgId = devOrgId();
  const params = await searchParams;
  const res = await apiFetch(`/v1/orgs/${orgId}/billing`);
  const overview: BillingOverview | null = res.ok
    ? ((await res.json()) as BillingOverview)
    : null;

  const atLimit =
    overview &&
    Number.isFinite(overview.runsLimit) &&
    overview.runsThisPeriod >= overview.runsLimit;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Billing</h1>

      {params.checkout === "success" && (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Checkout complete — Pro activates after Stripe confirms the subscription.
        </p>
      )}
      {params.checkout === "cancel" && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Checkout canceled.
        </p>
      )}

      {!overview && (
        <p className="mt-6 text-zinc-600">Billing API unavailable (org store / API required).</p>
      )}

      {overview && (
        <div className="mt-8 space-y-6">
          <section className="rounded-lg border border-zinc-200 p-5">
            <h2 className="text-sm font-medium text-zinc-500">Plan</h2>
            <p className="mt-1 text-xl capitalize">
              {overview.plan}{" "}
              <span className="text-base text-zinc-500">({overview.status})</span>
            </p>
            <p className="mt-3 text-sm text-zinc-600">
              Runs this month: {overview.runsThisPeriod}
              {Number.isFinite(overview.runsLimit)
                ? ` / ${overview.runsLimit}`
                : " (unlimited on Pro)"}
            </p>
            {atLimit && (
              <p className="mt-2 text-sm text-amber-700">
                Free tier limit reached ({overview.freeTierRunsPerMonth} runs/month). Upgrade to
                Pro for unlimited runs and metered LLM invoicing.
              </p>
            )}
            {overview.currentPeriodEnd && (
              <p className="mt-2 text-sm text-zinc-500">
                Current period ends {new Date(overview.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-zinc-200 p-5 text-sm text-zinc-600">
            <h2 className="font-medium text-zinc-800">How invoicing works</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Platform fee — fixed monthly subscription line item</li>
              <li>Model cost — metered pass-through via Stripe Billing Meters (micro-USD)</li>
            </ul>
          </section>

          <BillingActions
            canUpgrade={overview.billingEnabled && overview.canUpgrade}
            showPortal={
              overview.billingEnabled &&
              overview.plan === "pro" &&
              Boolean(overview.stripeCustomerId)
            }
          />

          {!overview.billingEnabled && (
            <p className="text-sm text-zinc-500">
              Stripe is not configured on this deployment. Set{" "}
              <code className="text-xs">STRIPE_SECRET_KEY</code> and price IDs — see{" "}
              <code className="text-xs">infra/billing/STRIPE.md</code>.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
