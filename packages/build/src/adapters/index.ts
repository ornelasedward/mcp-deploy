import type { Framework } from "@platform/detect";
import { langGraphAdapter } from "./langgraph";
import { openaiAgentsAdapter } from "./openai-agents";
import { mastraAdapter } from "./mastra";
import { vercelAiAdapter } from "./vercel-ai";
import type { AdaptPlan, AdaptResult, FrameworkAdapter } from "./types";
import { writeAdaptedAgent } from "./generate";
import { loadAgentFromPath } from "../load-agent";
import { findAgentRoot } from "../find-agent-root";

export * from "./types";
export { writeAdaptedAgent } from "./generate";

const ADAPTERS: FrameworkAdapter[] = [
  langGraphAdapter,
  openaiAgentsAdapter,
  mastraAdapter,
  vercelAiAdapter,
];

export async function planFrameworkImport(
  repoDir: string,
  prefer?: Framework,
): Promise<AdaptPlan | null> {
  if (prefer) {
    const adapter = ADAPTERS.find((a) => a.framework === prefer);
    if (adapter) return adapter.plan(repoDir);
  }
  for (const adapter of ADAPTERS) {
    const plan = await adapter.plan(repoDir);
    if (plan) return plan;
  }
  return null;
}

/**
 * Resolve an agent from a repo: native agent.config.ts or generated adapter shim.
 */
export async function adaptRepository(repoDir: string): Promise<AdaptResult | null> {
  const existing = await findAgentRoot(repoDir);
  if (existing) {
    const agent = await loadAgentFromPath(existing);
    return {
      agentRoot: existing,
      agent,
      framework: "convention",
      generated: false,
      plan: {
        framework: "convention",
        slug: agent.slug,
        name: agent.name,
        description: agent.description ?? "",
        entryPath: "agent.config.ts",
      },
    };
  }

  const plan = await planFrameworkImport(repoDir);
  if (!plan) return null;

  const agentRoot = await writeAdaptedAgent(repoDir, plan);
  const agent = await loadAgentFromPath(agentRoot);
  return { agentRoot, agent, framework: plan.framework, generated: true, plan };
}
