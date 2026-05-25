import type { LlmUsage } from "@platform/sdk";
import type { Database } from "./index";
import { usageEvents } from "./schema";

export async function recordUsage(
  db: Database,
  opts: { orgId: string; runId: string; usage: LlmUsage },
): Promise<void> {
  await db.insert(usageEvents).values({
    orgId: opts.orgId,
    runId: opts.runId,
    tokens: opts.usage.inputTokens + opts.usage.outputTokens,
    costUsd: opts.usage.costUsd,
  });
}
