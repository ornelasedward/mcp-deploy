import { randomUUID, createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { ResolvedAgent } from "@platform/sdk";
import {
  buildFromGit,
  buildFromLocalPath,
  buildAgentUrls,
  type ArtifactBuildResult,
} from "@platform/build";
import type { Database } from "./index";
import { agents, deployments, evalResults, orgs, projects } from "./schema";

export interface DeployRequest {
  orgId: string;
  /** Legacy: deploy from machine path (copied into artifact store). */
  projectDir?: string;
  repo?: string;
  commitSha?: string;
  isPreview?: boolean;
  prNumber?: number;
  /** Git deploy (P1): clone at commit into artifact store. */
  cloneUrl?: string;
  gitToken?: string;
  deploymentId?: string;
  artifactsDir: string;
}

export interface DeployResult {
  deploymentId: string;
  projectId: string;
  agent: ResolvedAgent;
  status: "live" | "failed";
  artifactDir: string;
  agentRoot: string;
  urls: ReturnType<typeof buildAgentUrls>;
}

export class DeployService {
  constructor(
    private db: Database,
    private baseUrl: string,
    private webBaseUrl: string,
    private artifactsDir: string,
    private platformDomain?: string,
    private deployEnv: "staging" | "production" = "production",
  ) {}

  async deploy(req: DeployRequest): Promise<DeployResult> {
    const deploymentId = req.deploymentId ?? randomUUID();
    let built: ArtifactBuildResult;

    if (req.cloneUrl && req.commitSha) {
      built = await buildFromGit({
        deploymentId,
        artifactsDir: req.artifactsDir,
        cloneUrl: req.cloneUrl,
        commitSha: req.commitSha,
        gitToken: req.gitToken,
      });
    } else if (req.projectDir) {
      built = await buildFromLocalPath({
        deploymentId,
        artifactsDir: req.artifactsDir,
        sourceDir: req.projectDir,
      });
    } else {
      throw new Error("deploy requires cloneUrl+commitSha or projectDir");
    }

    const { agent } = built;
    const handlerPath = req.projectDir ? resolve(req.projectDir) : built.agentRoot;
    const repo = req.repo ?? "local";
    const commitSha =
      req.commitSha ??
      built.commitSha ??
      createHash("sha256").update(`${repo}:${Date.now()}`).digest("hex").slice(0, 40);

    await this.db.insert(orgs).values({ id: req.orgId, name: req.orgId }).onConflictDoNothing();

    const existingProjects = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, req.orgId), eq(projects.repo, repo)));
    let project = existingProjects[0];
    if (!project) {
      const [created] = await this.db
        .insert(projects)
        .values({
          orgId: req.orgId,
          repo,
          framework: built.framework,
        })
        .returning();
      project = created!;
    } else {
      await this.db
        .update(projects)
        .set({ framework: built.framework })
        .where(eq(projects.id, project.id));
    }

    const manifest = {
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      distribute: agent.distribute,
      evals: agent.evals,
      artifactDir: built.artifactDir,
    };

    const existingDeploy = await this.db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, project.id))
      .then((rows) => rows.find((r) => r.commitSha === commitSha));

    let deployment = existingDeploy;
    if (deployment) {
      await this.db
        .update(deployments)
        .set({
          status: "live",
          snapshotRef: built.artifactDir,
          manifest,
          isPreview: req.isPreview ?? false,
          prNumber: req.prNumber ?? null,
        })
        .where(eq(deployments.id, deployment.id));
    } else {
      const [created] = await this.db
        .insert(deployments)
        .values({
          id: deploymentId,
          projectId: project.id,
          commitSha,
          status: "live",
          snapshotRef: built.artifactDir,
          manifest,
          isPreview: req.isPreview ?? false,
          prNumber: req.prNumber ?? null,
        })
        .returning();
      deployment = created!;
    }

    const existingAgent = await this.db
      .select()
      .from(agents)
      .where(eq(agents.projectId, project.id))
      .then((rows) => rows.find((r) => r.slug === agent.slug));

    if (existingAgent) {
      await this.db
        .update(agents)
        .set({
          name: agent.name,
          inputSchema: {},
          outputSchema: {},
          distribute: agent.distribute,
          publicPlayground: agent.public ?? false,
          handlerPath,
        })
        .where(eq(agents.id, existingAgent.id));
    } else {
      await this.db.insert(agents).values({
        projectId: project.id,
        slug: agent.slug,
        name: agent.name,
        inputSchema: {},
        outputSchema: {},
        distribute: agent.distribute,
        publicPlayground: agent.public ?? false,
        handlerPath,
      });
    }

    const urls = buildAgentUrls({
      slug: agent.slug,
      apiBaseUrl: this.baseUrl,
      webBaseUrl: this.webBaseUrl,
      platformDomain: this.platformDomain,
      deployEnv: this.deployEnv,
      isPreview: req.isPreview,
      prNumber: req.prNumber,
    });

    return {
      deploymentId: deployment.id,
      projectId: project.id,
      agent,
      status: "live",
      artifactDir: built.artifactDir,
      agentRoot: handlerPath,
      urls,
    };
  }

  async saveEvalResults(
    deploymentId: string,
    results: { name: string; passed: boolean; score: number; output?: unknown }[],
  ): Promise<void> {
    for (const r of results) {
      await this.db.insert(evalResults).values({
        deploymentId,
        caseName: r.name,
        score: r.score,
        passed: r.passed,
        output: r.output ?? null,
      });
    }
  }

  async findOrgByRepo(repo: string): Promise<string | null> {
    const rows = await this.db
      .select({ orgId: projects.orgId })
      .from(projects)
      .where(eq(projects.repo, repo))
      .limit(1);
    return rows[0]?.orgId ?? null;
  }

  async listHandlerPaths(): Promise<
    {
      slug: string;
      handlerPath: string;
      orgId: string;
      distribute: unknown;
      publicPlayground: boolean;
    }[]
  > {
    const rows = await this.db
      .select({
        slug: agents.slug,
        handlerPath: agents.handlerPath,
        orgId: projects.orgId,
        distribute: agents.distribute,
        publicPlayground: agents.publicPlayground,
      })
      .from(agents)
      .innerJoin(projects, eq(agents.projectId, projects.id));
    return rows.filter(
      (r): r is {
        slug: string;
        handlerPath: string;
        orgId: string;
        distribute: unknown;
        publicPlayground: boolean;
      } => Boolean(r.handlerPath),
    );
  }
}
