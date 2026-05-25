import { eq, and, desc } from "drizzle-orm";
import type { Database } from "./index";
import { deployments, evalResults } from "./schema";

/** Latest production (non-preview) eval scores per case — baseline for PR gates. */
export async function getProductionEvalBaseline(
  db: Database,
  projectId: string,
): Promise<Map<string, number>> {
  const [deploy] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(eq(deployments.projectId, projectId), eq(deployments.isPreview, false)))
    .orderBy(desc(deployments.createdAt))
    .limit(1);

  if (!deploy) return new Map();

  const rows = await db
    .select({ caseName: evalResults.caseName, score: evalResults.score })
    .from(evalResults)
    .where(eq(evalResults.deploymentId, deploy.id));

  return new Map(rows.map((r) => [r.caseName, r.score]));
}
