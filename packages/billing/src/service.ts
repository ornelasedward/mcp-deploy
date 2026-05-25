import Stripe from "stripe";
import type { Config } from "@platform/config";
import type { BillingStore, BillingPlan, BillingStatus } from "@platform/db";
import { BillingLimitError } from "./errors";
import { FREE_TIER, PRO_PLAN, isProPlan, assertSurfacesAllowed } from "./plans";
import { reportLlmMeterEvent } from "./stripe-meters";

export interface BillingServiceConfig {
  config: Config;
  store: BillingStore;
}

export interface BillingOverview {
  plan: BillingPlan;
  status: BillingStatus;
  runsThisPeriod: number;
  runsLimit: number;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  canUpgrade: boolean;
}

export class BillingService {
  private stripe: Stripe | null;

  constructor(private opts: BillingServiceConfig) {
    const key = opts.config.STRIPE_SECRET_KEY;
    this.stripe = key
      ? new Stripe(key, { typescript: true })
      : null;
  }

  get enabled(): boolean {
    return Boolean(this.stripe && this.opts.config.BILLING_ENABLED);
  }

  async getOverview(orgId: string): Promise<BillingOverview> {
    await this.opts.store.ensureOrg(orgId);
    const runs = await this.opts.store.syncRunsThisPeriod(orgId);
    const row = await this.opts.store.get(orgId);
    const plan = row?.plan ?? "free";
    const status = row?.status ?? "active";
    const pro = isProPlan(plan, status);
    return {
      plan,
      status,
      runsThisPeriod: runs,
      runsLimit: pro ? PRO_PLAN.runsPerMonth : FREE_TIER.runsPerMonth,
      stripeCustomerId: row?.stripeCustomerId ?? null,
      currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
      canUpgrade: !pro,
    };
  }

  async assertCanRun(orgId: string, surfaces?: string[]): Promise<void> {
    const overview = await this.getOverview(orgId);
    if (surfaces?.length) assertSurfacesAllowed(overview.plan, surfaces as never);

    if (isProPlan(overview.plan, overview.status)) {
      if (overview.status === "past_due") {
        throw new BillingLimitError("Subscription is past due", "past_due");
      }
      return;
    }

    if (overview.runsThisPeriod >= FREE_TIER.runsPerMonth) {
      throw new BillingLimitError(
        `Free tier allows ${FREE_TIER.runsPerMonth} runs/month. Upgrade to Pro for unlimited runs.`,
        "runs_exceeded",
      );
    }
  }

  async recordRunStarted(orgId: string): Promise<void> {
    await this.opts.store.incrementRunCount(orgId);
  }

  async recordLlmUsage(orgId: string, runId: string, costUsd: number): Promise<void> {
    if (!this.stripe || !this.opts.config.STRIPE_METER_LLM_EVENT) return;

    const row = await this.opts.store.get(orgId);
    if (!row?.stripeCustomerId || !isProPlan(row.plan, row.status)) return;

    await reportLlmMeterEvent(this.stripe, {
      eventName: this.opts.config.STRIPE_METER_LLM_EVENT,
      stripeCustomerId: row.stripeCustomerId,
      costUsd,
      runId,
    });
  }

  async ensureStripeCustomer(orgId: string, email?: string): Promise<string> {
    if (!this.stripe) throw new Error("Stripe is not configured");

    const existing = await this.opts.store.get(orgId);
    if (existing?.stripeCustomerId) return existing.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      metadata: { orgId },
      email,
    });
    await this.opts.store.setStripeCustomer(orgId, customer.id);
    return customer.id;
  }

  /**
   * Checkout with platform subscription + metered LLM price (separate invoice line items).
   * @see https://docs.stripe.com/billing/subscriptions/usage-based
   */
  async createCheckoutSession(
    orgId: string,
    urls: { success: string; cancel: string },
  ): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe) throw new Error("Stripe is not configured");

    const platformPrice = this.opts.config.STRIPE_PRICE_PLATFORM_MONTHLY;
    const llmPrice = this.opts.config.STRIPE_PRICE_LLM_METERED;
    if (!platformPrice) throw new Error("STRIPE_PRICE_PLATFORM_MONTHLY is required");

    const customerId = await this.ensureStripeCustomer(orgId);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: platformPrice, quantity: 1 },
    ];
    if (llmPrice) {
      lineItems.push({ price: llmPrice });
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: lineItems,
      success_url: urls.success,
      cancel_url: urls.cancel,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { orgId },
      },
      metadata: { orgId },
    });

    if (!session.url) throw new Error("Stripe Checkout did not return a URL");
    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(orgId: string, returnUrl: string): Promise<string> {
    if (!this.stripe) throw new Error("Stripe is not configured");
    const row = await this.opts.store.get(orgId);
    if (!row?.stripeCustomerId) throw new Error("No Stripe customer for org");

    const session = await this.stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    if (!this.stripe || !this.opts.config.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe webhooks are not configured");
    }

    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.opts.config.STRIPE_WEBHOOK_SECRET,
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (orgId && subId) {
          await this.opts.store.setSubscription(orgId, {
            plan: "pro",
            status: "active",
            stripeSubscriptionId: subId,
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (!orgId) {
          const byCustomer = await this.opts.store.getByStripeCustomer(
            typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          );
          if (!byCustomer) break;
          await this.applySubscription(byCustomer.orgId, sub);
          break;
        }
        await this.applySubscription(orgId, sub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;
        const row = await this.opts.store.getByStripeCustomer(customerId);
        if (row) {
          await this.opts.store.setSubscription(row.orgId, { status: "past_due" });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;
        const row = await this.opts.store.getByStripeCustomer(customerId);
        if (row?.plan === "pro") {
          await this.opts.store.setSubscription(row.orgId, { status: "active" });
        }
        break;
      }
      default:
        break;
    }
  }

  private async applySubscription(orgId: string, sub: Stripe.Subscription): Promise<void> {
    const status = mapSubscriptionStatus(sub.status);
    const periodEnd = sub.items.data[0]?.current_period_end
      ? new Date(sub.items.data[0].current_period_end * 1000)
      : null;

    await this.opts.store.setSubscription(orgId, {
      plan: sub.status === "canceled" ? "free" : "pro",
      status,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd,
    });
  }
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): BillingStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "active";
  }
}
