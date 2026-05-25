import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * as schema from "./schema";
export { PostgresTraceStore } from "./trace-store";
export { DeployService } from "./deploy-service";
export { OrgStore } from "./org-store";
export { DashboardStore } from "./dashboard-store";
export { loadAgentFromPath } from "./load-agent";
export { recordUsage } from "./usage-store";
export { BudgetStore } from "./budget-store";
export { SecretsStore } from "./secrets-store";
export { getProductionEvalBaseline } from "./eval-store";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Lazily connect. Only required when TRACE_STORE/persistence is set to postgres. */
export function createDb(url: string): Database {
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}
