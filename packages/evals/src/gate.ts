import type { EvalResult } from "./index";

export interface EvalGateFailure {
  name: string;
  reason: "grader_failed" | "regression";
  score: number;
  baseline?: number;
}

export interface EvalGateResult {
  passed: boolean;
  failures: EvalGateFailure[];
  avgScore: number;
}

/** Block deploy when any case fails or score drops more than maxRegression vs production baseline. */
export function checkEvalGate(
  results: EvalResult[],
  baseline: Map<string, number>,
  maxRegression: number,
): EvalGateResult {
  const failures: EvalGateFailure[] = [];
  let total = 0;

  for (const r of results) {
    total += r.score;
    if (!r.passed) {
      failures.push({ name: r.name, reason: "grader_failed", score: r.score });
    }
    const base = baseline.get(r.name);
    if (base != null && r.score < base - maxRegression) {
      failures.push({
        name: r.name,
        reason: "regression",
        score: r.score,
        baseline: base,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    avgScore: results.length > 0 ? total / results.length : 0,
  };
}
