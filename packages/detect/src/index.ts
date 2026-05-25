import { readFile, access, readdir } from "node:fs/promises";
import { join } from "node:path";

export const FRAMEWORKS = [
  "convention",
  "langgraph",
  "openai-agents",
  "mastra",
  "vercel-ai",
  "unknown",
] as const;

export type Framework = (typeof FRAMEWORKS)[number];

export interface FrameworkDetectResult {
  framework: Framework;
  /** Relative path to entry module when adapter can wire it. */
  entryPath?: string;
  /** Named export to invoke (default export if omitted). */
  entryExport?: string;
}

const exists = (p: string) => access(p).then(() => true).catch(() => false);

async function readPackageDeps(repoDir: string): Promise<Record<string, string>> {
  const pkgPath = join(repoDir, "package.json");
  if (!(await exists(pkgPath))) return {};
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

async function findFileContaining(
  repoDir: string,
  pattern: RegExp,
  names: string[],
  maxDepth = 4,
): Promise<string | undefined> {
  const queue = [{ dir: repoDir, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        if (!names.some((n) => e.name.endsWith(n))) continue;
        const full = join(dir, e.name);
        const text = await readFile(full, "utf8").catch(() => "");
        if (pattern.test(text)) {
          return full.slice(repoDir.length + 1).replace(/\\/g, "/");
        }
      }
      if (depth >= maxDepth) continue;
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
          queue.push({ dir: join(dir, e.name), depth: depth + 1 });
        }
      }
    } catch {
      /* skip */
    }
  }
  return undefined;
}

/** Identify the agent framework from a repo so the build pipeline can wire the entrypoint. */
export async function detectFramework(repoDir: string): Promise<Framework> {
  return (await detectFrameworkInfo(repoDir)).framework;
}

/** Rich detection used by import adapters (entry path + export hint). */
export async function detectFrameworkInfo(repoDir: string): Promise<FrameworkDetectResult> {
  if (await exists(join(repoDir, "agent.config.ts"))) {
    return { framework: "convention" };
  }
  if (await exists(join(repoDir, "agent.config.js"))) {
    return { framework: "convention" };
  }

  const deps = await readPackageDeps(repoDir);

  if (deps["@langchain/langgraph"] || deps.langgraph) {
    const entryPath =
      (await exists(join(repoDir, "langgraph.json")))
        ? await findFileContaining(repoDir, /StateGraph|Annotation/i, [".ts", ".js"])
        : await findFileContaining(repoDir, /StateGraph|\.compile\(/i, [".ts", ".js"]);
    return {
      framework: "langgraph",
      entryPath: entryPath ?? "src/graph.ts",
      entryExport: "graph",
    };
  }

  if (deps["@openai/agents"] || deps["@openai/agents-sdk"]) {
    const entryPath = await findFileContaining(repoDir, /from\s+["']@openai\/agents|new\s+Agent/i, [
      ".ts",
      ".js",
    ]);
    return {
      framework: "openai-agents",
      entryPath: entryPath ?? "src/agent.ts",
      entryExport: "agent",
    };
  }

  if (deps["@mastra/core"] || deps.mastra) {
    const entryPath = await findFileContaining(repoDir, /new\s+Mastra|@mastra\/core/i, [
      ".ts",
      ".js",
    ]);
    return {
      framework: "mastra",
      entryPath: entryPath ?? "src/mastra/index.ts",
    };
  }

  if (deps.ai || deps["@ai-sdk/openai"] || deps["@ai-sdk/anthropic"]) {
    const entryPath = await findFileContaining(
      repoDir,
      /generateText|streamText|from\s+["']ai["']/i,
      [".ts", ".js"],
    );
    return {
      framework: "vercel-ai",
      entryPath: entryPath ?? "src/agent.ts",
    };
  }

  const reqPath = join(repoDir, "requirements.txt");
  if (await exists(reqPath)) {
    const reqs = await readFile(reqPath, "utf8");
    if (/langgraph/i.test(reqs)) return { framework: "langgraph", entryPath: "agent.py" };
    if (/openai-agents/i.test(reqs)) return { framework: "openai-agents", entryPath: "agent.py" };
  }

  return { framework: "unknown" };
}
