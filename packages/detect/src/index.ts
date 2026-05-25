import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

export type Framework = "langgraph" | "openai-agents" | "mastra" | "convention" | "unknown";

const exists = (p: string) => access(p).then(() => true).catch(() => false);

/** Identify the agent framework from a repo so the build pipeline can wire the entrypoint. */
export async function detectFramework(repoDir: string): Promise<Framework> {
  if (await exists(join(repoDir, "agent.config.ts"))) return "convention";
  if (await exists(join(repoDir, "agent.config.js"))) return "convention";

  const pkgPath = join(repoDir, "package.json");
  if (await exists(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["@langchain/langgraph"]) return "langgraph";
    if (deps["@openai/agents"]) return "openai-agents";
    if (deps["@mastra/core"]) return "mastra";
  }

  const reqPath = join(repoDir, "requirements.txt");
  if (await exists(reqPath)) {
    const reqs = await readFile(reqPath, "utf8");
    if (/langgraph/i.test(reqs)) return "langgraph";
    if (/openai-agents/i.test(reqs)) return "openai-agents";
  }
  return "unknown";
}
