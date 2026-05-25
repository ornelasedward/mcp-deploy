import type { ResolvedAgent } from "@platform/sdk";
import type { Dispatch } from "@platform/core";
import type { Budget } from "@platform/gateway";

export interface EvalCase {
  name: string;
  input: unknown;
  /** A grader: contains expected, regex, or expects an LLM-judge (extend as needed). */
  expect?: Record<string, unknown>;
}

export interface EvalResult {
  name: string;
  passed: boolean;
  score: number;
  output?: unknown;
  error?: string;
}

export type Grader = (output: unknown, c: EvalCase) => { passed: boolean; score: number };

export const graders: Record<string, Grader> = {
  exact: (output, c) => {
    const passed = JSON.stringify(output) === JSON.stringify(c.expect?.equals);
    return { passed, score: passed ? 1 : 0 };
  },
  contains: (output, c) => {
    const passed = JSON.stringify(output).includes(String(c.expect?.contains ?? ""));
    return { passed, score: passed ? 1 : 0 };
  },
};

/** Run every case through the dispatcher (source="eval") and grade. Used on deploy/PR. */
export async function runEvals(
  agent: ResolvedAgent,
  cases: EvalCase[],
  deps: { dispatch: Dispatch; orgId: string; budget: Budget },
): Promise<EvalResult[]> {
  const out: EvalResult[] = [];
  for (const c of cases) {
    const run = await deps.dispatch({
      agent, input: c.input, source: "eval", orgId: deps.orgId, budget: deps.budget,
    });
    if (run.status === "failed") {
      out.push({ name: c.name, passed: false, score: 0, error: run.error });
      continue;
    }
    const graderName = Object.keys(c.expect ?? { contains: "" })[0] ?? "contains";
    const grade = (graders[graderName] ?? graders.contains)!(run.output, c);
    out.push({ name: c.name, ...grade, output: run.output });
  }
  return out;
}
