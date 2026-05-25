import type { ResolvedAgent } from "@platform/sdk";
import type { Dispatch } from "@platform/core";
import type { Budget, Gateway } from "@platform/gateway";
import { gradeWithLlmJudge, type LlmJudgeExpect } from "./llm-judge";

export * from "./gate";
export * from "./llm-judge";
export interface EvalCase {
  name: string;
  input: unknown;
  /** Grader key: `contains`, `exact`, or `llm-judge` with criteria object. */
  expect?: Record<string, unknown>;
}

export interface EvalResult {
  name: string;
  passed: boolean;
  score: number;
  output?: unknown;
  error?: string;
}

export type Grader = (
  output: unknown,
  c: EvalCase,
  deps?: { generate: (opts: import("@platform/sdk").GenerateOptions) => Promise<{ text: string }> },
) => Promise<{ passed: boolean; score: number }> | { passed: boolean; score: number };

export const graders: Record<string, Grader> = {
  exact: (output, c) => {
    const passed = JSON.stringify(output) === JSON.stringify(c.expect?.equals);
    return { passed, score: passed ? 1 : 0 };
  },
  contains: (output, c) => {
    const passed = JSON.stringify(output).includes(String(c.expect?.contains ?? ""));
    return { passed, score: passed ? 1 : 0 };
  },
  "llm-judge": async (output, c, deps) => {
    if (!deps) throw new Error("llm-judge grader requires gateway");
    const spec = c.expect?.["llm-judge"] as LlmJudgeExpect | undefined;
    if (!spec?.criteria) throw new Error("llm-judge expect.criteria required");
    return gradeWithLlmJudge(output, spec, deps);
  },
};

function graderName(c: EvalCase): string {
  const keys = Object.keys(c.expect ?? {});
  if (keys.includes("llm-judge")) return "llm-judge";
  return keys[0] ?? "contains";
}

/** Run every case through the dispatcher (source="eval") and grade. Used on deploy/PR. */
export async function runEvals(
  agent: ResolvedAgent,
  cases: EvalCase[],
  deps: {
    dispatch: Dispatch;
    orgId: string;
    budget: Budget;
    gateway?: Gateway;
    runIdPrefix?: string;
  },
): Promise<EvalResult[]> {
  const judgeRunId = deps.runIdPrefix ?? "eval";
  const judgeClient = deps.gateway?.forRun({
    runId: `${judgeRunId}:judge`,
    orgId: deps.orgId,
    budget: deps.budget,
    trace: { event() {}, span: async (_t, _p, fn) => fn() },
  });

  const judgeDeps = judgeClient
    ? { generate: (opts: import("@platform/sdk").GenerateOptions) => judgeClient.generate(opts) }
    : undefined;

  const out: EvalResult[] = [];
  for (const c of cases) {
    const run = await deps.dispatch({
      agent,
      input: c.input,
      source: "eval",
      orgId: deps.orgId,
      idempotencyKey: deps.runIdPrefix ? `${deps.runIdPrefix}:${c.name}` : undefined,
      budget: deps.budget,
    });
    if (run.status === "failed") {
      out.push({ name: c.name, passed: false, score: 0, error: run.error });
      continue;
    }
    const name = graderName(c);
    const grader = graders[name] ?? graders.contains;
    const grade = await grader(run.output, c, judgeDeps);
    out.push({ name: c.name, ...grade, output: run.output });
  }
  return out;
}
