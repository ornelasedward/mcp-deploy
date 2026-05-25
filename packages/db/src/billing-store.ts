import { eq, sql, and, gte, count } from "drizzle-orm";
import type { Database } from "./index";
import { orgBilling, runs } from "./schema";

export type BillingPlan = "free" | "pro";
export type BillingStatus = "active" | "past_due" | "canceled" | "trialing";

export interface OrgBillingRow {
  orgId: string;
  plan: BillingPlan;
  status: BillingStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  runsThisPeriod: number;
  periodStart: Date;
}

function monthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export class BillingStore {
  private mem = new Map<string, OrgBillingRow>();

  constructor(private db?: Database) {}

  private memRow(orgId: string): OrgBillingRow {
    const start = monthStart();
    let row = this.mem.get(orgId);
    if (!row || row.periodStart < start) {
      row = {
        orgId,
        plan: "free",
        status: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        runsThisPeriod: 0,
        periodStart: start,
      };
      this.mem.set(orgId, row);
    }
    return row;
  }

  async ensureOrg(orgId: string): Promise<OrgBillingRow> {
    if (!this.db) return this.memRow(orgId);
    await this.db.insert(orgBilling).values({ orgId }).onConflictDoNothing();
    const row = await this.get(orgId);
    return row!;
  }

  async get(orgId: string): Promise<OrgBillingRow | null> {
    if (!this.db) return this.mem.get(orgId) ?? null;
    const rows = await this.db.select().from(orgBilling).where(eq(orgBilling.orgId, orgId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      orgId: row.orgId,
      plan: row.plan as BillingPlan,
      status: row.status as BillingStatus,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      currentPeriodEnd: row.currentPeriodEnd,
      runsThisPeriod: row.runsThisPeriod,
      periodStart: row.periodStart,
    };
  }

  async getByStripeCustomer(customerId: string): Promise<OrgBillingRow | null> {
    if (!this.db) {
      for (const row of this.mem.values()) {
        if (row.stripeCustomerId === customerId) return row;
      }
      return null;
    }
    const rows = await this.db
      .select()
      .from(orgBilling)
      .where(eq(orgBilling.stripeCustomerId, customerId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      orgId: row.orgId,
      plan: row.plan as BillingPlan,
      status: row.status as BillingStatus,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      currentPeriodEnd: row.currentPeriodEnd,
      runsThisPeriod: row.runsThisPeriod,
      periodStart: row.periodStart,
    };
  }

  async setStripeCustomer(orgId: string, customerId: string): Promise<void> {
    await this.ensureOrg(orgId);
    if (!this.db) {
      const row = this.memRow(orgId);
      row.stripeCustomerId = customerId;
      return;
    }
    await this.db
      .update(orgBilling)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(orgBilling.orgId, orgId));
  }

  async setSubscription(
    orgId: string,
    patch: {
      plan?: BillingPlan;
      status?: BillingStatus;
      stripeSubscriptionId?: string | null;
      currentPeriodEnd?: Date | null;
    },
  ): Promise<void> {
    await this.ensureOrg(orgId);
    if (!this.db) {
      const row = this.memRow(orgId);
      if (patch.plan != null) row.plan = patch.plan;
      if (patch.status != null) row.status = patch.status;
      if (patch.stripeSubscriptionId !== undefined) {
        row.stripeSubscriptionId = patch.stripeSubscriptionId;
      }
      if (patch.currentPeriodEnd !== undefined) row.currentPeriodEnd = patch.currentPeriodEnd;
      return;
    }
    await this.db
      .update(orgBilling)
      .set({
        ...(patch.plan != null ? { plan: patch.plan } : {}),
        ...(patch.status != null ? { status: patch.status } : {}),
        ...(patch.stripeSubscriptionId !== undefined
          ? { stripeSubscriptionId: patch.stripeSubscriptionId }
          : {}),
        ...(patch.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: patch.currentPeriodEnd }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(orgBilling.orgId, orgId));
  }

  /** Sync run counter from runs table (source of truth). */
  async syncRunsThisPeriod(orgId: string): Promise<number> {
    if (!this.db) return this.memRow(orgId).runsThisPeriod;
    const start = monthStart();
    const [row] = await this.db
      .select({ total: count() })
      .from(runs)
      .where(and(eq(runs.orgId, orgId), gte(runs.createdAt, start)));
    const total = Number(row?.total ?? 0);
    await this.ensureOrg(orgId);
    await this.db
      .update(orgBilling)
      .set({ runsThisPeriod: total, periodStart: start, updatedAt: new Date() })
      .where(eq(orgBilling.orgId, orgId));
    return total;
  }

  async incrementRunCount(orgId: string): Promise<number> {
    if (!this.db) {
      const row = this.memRow(orgId);
      row.runsThisPeriod += 1;
      return row.runsThisPeriod;
    }
    await this.ensureOrg(orgId);
    const start = monthStart();
    const [updated] = await this.db
      .update(orgBilling)
      .set({
        runsThisPeriod: sql`${orgBilling.runsThisPeriod} + 1`,
        periodStart: start,
        updatedAt: new Date(),
      })
      .where(eq(orgBilling.orgId, orgId))
      .returning({ runsThisPeriod: orgBilling.runsThisPeriod });
    return updated?.runsThisPeriod ?? 1;
  }
}
