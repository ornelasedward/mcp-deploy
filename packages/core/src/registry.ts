import type { ResolvedAgent } from "@platform/sdk";

/** Per-org in-memory agent registry (handlers loaded from artifacts). */
export class AgentRegistry {
  private byOrg = new Map<string, Map<string, ResolvedAgent>>();

  register(agent: ResolvedAgent, orgId: string) {
    if (!this.byOrg.has(orgId)) this.byOrg.set(orgId, new Map());
    this.byOrg.get(orgId)!.set(agent.slug, agent);
    return this;
  }

  /** Patch in-memory agent (e.g. after PATCH distribute). */
  patch(orgId: string, slug: string, patch: Partial<ResolvedAgent>): ResolvedAgent | undefined {
    const existing = this.get(slug, orgId);
    if (!existing) return undefined;
    const next = { ...existing, ...patch, slug: existing.slug };
    this.register(next, orgId);
    return next;
  }

  get(slug: string, orgId: string): ResolvedAgent | undefined {
    return this.byOrg.get(orgId)?.get(slug);
  }

  all(orgId?: string): ResolvedAgent[] {
    if (orgId) return [...(this.byOrg.get(orgId)?.values() ?? [])];
    return [...this.byOrg.values()].flatMap((m) => [...m.values()]);
  }

  orgIds(): string[] {
    return [...this.byOrg.keys()];
  }
}
