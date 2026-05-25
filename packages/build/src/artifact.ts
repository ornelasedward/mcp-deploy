import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { detectFramework } from "@platform/detect";
import { loadAgentFromPath } from "./load-agent";
import type { ResolvedAgent } from "@platform/sdk";
import { cloneAtCommit } from "./clone";

const AGENT_CONFIG = "agent.config.ts";

/** Walk up to depth 4 looking for agent.config.ts. */
export async function findAgentRoot(searchRoot: string): Promise<string | null> {
  const queue = [{ dir: resolve(searchRoot), depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      if (entries.some((e) => e.isFile() && e.name === AGENT_CONFIG)) {
        return dir;
      }
      if (depth >= 4) continue;
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
          queue.push({ dir: join(dir, e.name), depth: depth + 1 });
        }
      }
    } catch {
      // skip unreadable
    }
  }
  return null;
}

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

/** Copy a local directory into the artifact store (CLI / manual deploy). */
export async function buildFromLocalPath(opts: BuildFromPathOptions): Promise<ArtifactBuildResult> {
  const source = resolve(opts.sourceDir);
  const agent = await loadAgentFromPath(source);
  const framework = await detectFramework(source);

  const artifactDir = join(resolve(opts.artifactsDir), opts.deploymentId);
  const sourceCopy = join(artifactDir, "source");
  await mkdir(artifactDir, { recursive: true });
  await cp(source, sourceCopy, {
    recursive: true,
    filter: (src) => !src.replace(/\\/g, "/").includes("/node_modules/"),
  });

  const agentRoot = (await findAgentRoot(sourceCopy)) ?? sourceCopy;
  await writeFile(
    join(artifactDir, "manifest.json"),
    JSON.stringify({
      agentRoot,
      slug: agent.slug,
      framework,
      devSourcePath: source,
    }, null, 2),
  );
  return { artifactDir, agentRoot: source, agent, framework };
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

  const agentRoot = await findAgentRoot(cloneDir);
  if (!agentRoot) throw new Error(`No ${AGENT_CONFIG} found in repository at ${opts.commitSha}`);

  const agent = await loadAgentFromPath(agentRoot);
  const framework = await detectFramework(agentRoot);
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
