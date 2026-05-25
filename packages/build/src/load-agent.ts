import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ResolvedAgent } from "@platform/sdk";

/** Dynamically import an agent manifest + handler from a project directory. */
export async function loadAgentFromPath(projectDir: string): Promise<ResolvedAgent> {
  const configPath = resolve(projectDir, "agent.config.ts");
  const mod = await import(pathToFileURL(configPath).href);
  if (!mod.default) throw new Error(`No default export in ${configPath}`);
  return mod.default as ResolvedAgent;
}
