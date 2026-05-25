import type { ResolvedAgent } from "@platform/sdk";
import type { DashboardStore } from "@platform/db";
import type { AgentRegistry } from "./registry";
import { isEnabled } from "./surfaces";

export function findPublicAgentInRegistry(
  registry: AgentRegistry,
  slug: string,
): { agent: ResolvedAgent; orgId: string } | null {
  for (const orgId of registry.orgIds()) {
    const agent = registry.get(slug, orgId);
    if (agent?.public && isEnabled(agent, "playground")) {
      return { agent, orgId };
    }
  }
  return null;
}

export async function resolvePublicAgent(
  registry: AgentRegistry,
  slug: string,
  dashboard?: DashboardStore,
): Promise<{ agent: ResolvedAgent; orgId: string } | null> {
  if (dashboard) {
    const row = await dashboard.findPublicAgentBySlug(slug);
    if (row) {
      const agent = registry.get(slug, row.orgId);
      if (agent?.public) return { agent, orgId: row.orgId };
    }
  }
  return findPublicAgentInRegistry(registry, slug);
}
