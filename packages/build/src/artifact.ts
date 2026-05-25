import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadAgentFromPath } from "./load-agent";
import type { ResolvedAgent } from "@platform/sdk";
import { cloneAtCommit } from "./clone";
import { adaptRepository } from "./adapters/index";
import { findAgentRoot } from "./find-agent-root";

export { findAgentRoot };

export interface BuildFromGitOptions {
  deploymentId: string;
  artifactsDir: string;
  cloneUrl: string;
  commitSha: string;
  gitToken?: string;
}

export interface BuildFromPathOptions {
  deploymentId: string;
  artifactsDir: string;
  sourceDir: string;
}

export interface ArtifactBuildResult {
  artifactDir: string;
  agentRoot: string;
  agent: ResolvedAgent;
  framework: string;
  commitSha?: string;
}

async function resolveAgent(sourceDir: string) {
  const adapted = await adaptRepository(sourceDir);
  if (adapted) {
    return {
      agentRoot: adapted.agentRoot,
      agent: adapted.agent,
      framework: adapted.framework,
    };
  }
  const root = await findAgentRoot(sourceDir);
  if (!root) {
    throw new Error(
      "No agent.config.ts and no supported framework (LangGraph, OpenAI Agents, Mastra, Vercel AI SDK)",
    );
  }
  const agent = await loadAgentFromPath(root);
  return { agentRoot: root, agent, framework: "convention" as const };
}

/** Copy a local directory into the artifact store (CLI / manual deploy). */
export async function buildFromLocalPath(opts: BuildFromPathOptions): Promise<ArtifactBuildResult> {
  const source = resolve(opts.sourceDir);
  const { agentRoot, agent, framework } = await resolveAgent(source);

  const artifactDir = join(resolve(opts.artifactsDir), opts.deploymentId);
  const sourceCopy = join(artifactDir, "source");
  await mkdir(artifactDir, { recursive: true });
  await cp(source, sourceCopy, {
    recursive: true,
    filter: (src) => !src.replace(/\\/g, "/").includes("/node_modules/"),
  });

  const copyAgentRoot =
    (await findAgentRoot(sourceCopy)) ??
    (framework !== "convention" ? join(sourceCopy, ".agentd") : sourceCopy);

  await writeFile(
    join(artifactDir, "manifest.json"),
    JSON.stringify({
      agentRoot: copyAgentRoot,
      slug: agent.slug,
      framework,
      devSourcePath: source,
    }, null, 2),
  );
  return { artifactDir, agentRoot, agent, framework };
}

/** Clone git repo at commit, discover agent, persist under artifactsDir. */
export async function buildFromGit(opts: BuildFromGitOptions): Promise<ArtifactBuildResult> {
  const artifactDir = join(resolve(opts.artifactsDir), opts.deploymentId);
  const cloneDir = join(artifactDir, "repo");
  await mkdir(artifactDir, { recursive: true });

  await cloneAtCommit({
    cloneUrl: opts.cloneUrl,
    commitSha: opts.commitSha,
    workDir: cloneDir,
    gitToken: opts.gitToken,
  });

  const { agentRoot, agent, framework } = await resolveAgent(cloneDir);
  await writeFile(
    join(artifactDir, "manifest.json"),
    JSON.stringify({ agentRoot, slug: agent.slug, framework, commitSha: opts.commitSha }, null, 2),
  );

  return {
    artifactDir,
    agentRoot,
    agent,
    framework,
    commitSha: opts.commitSha,
  };
}

/** Read manifest and return agent root path for hydration after restart. */
export async function loadArtifactAgent(artifactDir: string): Promise<ResolvedAgent> {
  const manifestPath = join(artifactDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { agentRoot: string };
  const root = resolve(artifactDir, "repo", manifest.agentRoot);
  const found = await findAgentRoot(join(artifactDir, "repo"));
  return loadAgentFromPath(found ?? root);
}
