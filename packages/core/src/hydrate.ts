import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ResolvedAgent, Surface } from "@platform/sdk";
import { SURFACES } from "@platform/sdk";
import { loadAgentFromPath } from "@platform/db";
import type { AgentRegistry } from "./index";
import type { DeployService } from "@platform/db";

/** Scan a directory for subfolders containing agent.config.ts and register each. */
export async function scanAgentsDir(
  registry: AgentRegistry,
  agentsDir: string,
  orgId: string,
): Promise<ResolvedAgent[]> {
  const root = resolve(agentsDir);
  const loaded: ResolvedAgent[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true }).then((d) =>
      d.filter((e) => e.isDirectory()).map((e) => e.name),
    );
  } catch {
    return loaded;
  }
  for (const name of entries) {
    try {
      const agent = await loadAgentFromPath(join(root, name));
      registry.register(agent, orgId);
      loaded.push(agent);
    } catch {
      // skip non-agent directories
    }
  }
  return loaded;
}

/** Hydrate registry from Postgres handler paths + optional agents directory. */
export async function hydrateRegistry(
  registry: AgentRegistry,
  opts: { agentsDir?: string; deploy?: DeployService; defaultOrgId?: string },
): Promise<void> {
  if (opts.deploy) {
    const paths = await opts.deploy.listHandlerPaths();
    for (const { handlerPath, orgId, distribute, publicPlayground } of paths) {
      try {
        const loaded = await loadAgentFromPath(handlerPath);
        const surfaces = Array.isArray(distribute)
          ? (distribute as Surface[]).filter((s) => SURFACES.includes(s as Surface))
          : loaded.distribute;
        registry.register(
          { ...loaded, distribute: surfaces.length ? surfaces : loaded.distribute, public: publicPlayground },
          orgId,
        );
      } catch (err) {
        console.warn(`[hydrate] skip ${handlerPath}:`, err);
      }
    }
  }
  if (opts.agentsDir && opts.defaultOrgId) {
    await scanAgentsDir(registry, opts.agentsDir, opts.defaultOrgId);
  }
}
