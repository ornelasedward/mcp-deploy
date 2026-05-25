import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ResolvedAgent } from "@platform/sdk";
import type { Dispatch } from "@platform/core";
import type { Budget, Gateway } from "@platform/gateway";
import {
  runEvals,
  checkEvalGate,
  type EvalCase,
  type EvalResult,
  type EvalGateResult,
} from "@platform/evals";

export interface DeployEvalPersistence {
  saveEvalResults(
    deploymentId: string,
    results: EvalResult[],
    baseline?: Map<string, number>,
  ): Promise<void>;
  markDeploymentFailed(deploymentId: string): Promise<void>;
}

export interface DeployEvalOutcome {
  results: EvalResult[];
  gate: EvalGateResult;
  blocked: boolean;
}

export async function runDeployEvals(opts: {
  agent: ResolvedAgent;
  agentRoot: string;
  deploymentId: string;
  orgId: string;
  projectId: string;
  dispatch: Dispatch;
  budget: Budget;
  gateway: Gateway;
  deploy: DeployEvalPersistence;
  maxRegression: number;
  blockDeploy: boolean;
  getBaseline: (projectId: string) => Promise<Map<string, number>>;
}): Promise<DeployEvalOutcome | null> {
  if (!opts.agent.evals) return null;

  const casesPath = resolve(
    opts.agentRoot,
    opts.agent.evals.replace(/^\.\//, ""),
    "cases.json",
  );
  const cases = JSON.parse(await readFile(casesPath, "utf8")) as EvalCase[];

  const results = await runEvals(opts.agent, cases, {
    dispatch: opts.dispatch,
    orgId: opts.orgId,
    budget: opts.budget,
    gateway: opts.gateway,
    runIdPrefix: opts.deploymentId,
  });

  const baseline = await opts.getBaseline(opts.projectId);
  const gate = checkEvalGate(results, baseline, opts.maxRegression);

  await opts.deploy.saveEvalResults(opts.deploymentId, results, baseline);

  if (!gate.passed && opts.blockDeploy) {
    await opts.deploy.markDeploymentFailed(opts.deploymentId);
  }

  return { results, gate, blocked: !gate.passed && opts.blockDeploy };
}
