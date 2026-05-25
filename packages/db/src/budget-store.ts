import { eq, sql, and, gte } from "drizzle-orm";
import type { Budget, MonthlySpendTracker } from "@platform/gateway";
import type { Database } from "./index";
import { budgets, usageEvents } from "./schema";

export interface OrgBudgetRow {
  orgId: string;
  monthlyCapUsd: number;
  perRunCapUsd: number;
  hardStop: boolean;
}

function monthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export class BudgetStore implements MonthlySpendTracker {
  private memSpend = new Map<string, number>();

  constructor(
    private db?: Database,
    private defaults?: { monthlyCapUsd: number; perRunCapUsd: number },
  ) {}

  async getOrgBudget(orgId: string): Promise<OrgBudgetRow> {
    if (this.db) {
      const rows = await this.db.select().from(budgets).where(eq(budgets.orgId, orgId)).limit(1);
      if (rows[0]) return rows[0];
    }
    return {
      orgId,
      monthlyCapUsd: this.defaults?.monthlyCapUsd ?? 50,
      perRunCapUsd: this.defaults?.perRunCapUsd ?? 0.5,
      hardStop: true,
    };
  }

  async resolveBudget(orgId: string): Promise<Budget> {
    const row = await this.getOrgBudget(orgId);
    return {
      perRunCapUsd: row.perRunCapUsd,
      monthlyCapUsd: row.monthlyCapUsd,
      hardStop: row.hardStop,
    };
  }

  async getMonthlySpendUsd(orgId: string): Promise<number> {
    if (this.db) {
      const start = monthStart();
      const [row] = await this.db
        .select({
          total: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)`,
        })
        .from(usageEvents)
        .where(and(eq(usageEvents.orgId, orgId), gte(usageEvents.ts, start)));
      return Number(row?.total ?? 0);
    }
    return this.memSpend.get(orgId) ?? 0;
  }

  async addSpend(orgId: string, costUsd: number): Promise<void> {
    if (this.db) return;
    const prev = this.memSpend.get(orgId) ?? 0;
    this.memSpend.set(orgId, prev + costUsd);
  }

  async getOrgSpendSummary(orgId: string) {
    const budget = await this.getOrgBudget(orgId);
    const spentUsd = await this.getMonthlySpendUsd(orgId);
    return {
      monthlyCapUsd: budget.monthlyCapUsd,
      spentUsd,
      remainingUsd: Math.max(0, budget.monthlyCapUsd - spentUsd),
      hardStop: budget.hardStop,
      perRunCapUsd: budget.perRunCapUsd,
    };
  }

  async updateOrgBudget(
    orgId: string,
    patch: Partial<Pick<OrgBudgetRow, "monthlyCapUsd" | "perRunCapUsd" | "hardStop">>,
  ) {
    if (!this.db) throw new Error("DATABASE_URL required to update budgets");
    await this.db
      .insert(budgets)
      .values({
        orgId,
        monthlyCapUsd: patch.monthlyCapUsd ?? this.defaults?.monthlyCapUsd ?? 50,
        perRunCapUsd: patch.perRunCapUsd ?? this.defaults?.perRunCapUsd ?? 0.5,
        hardStop: patch.hardStop ?? true,
      })
      .onConflictDoUpdate({
        target: budgets.orgId,
        set: {
          ...(patch.monthlyCapUsd != null ? { monthlyCapUsd: patch.monthlyCapUsd } : {}),
          ...(patch.perRunCapUsd != null ? { perRunCapUsd: patch.perRunCapUsd } : {}),
          ...(patch.hardStop != null ? { hardStop: patch.hardStop } : {}),
        },
      });
  }
}
