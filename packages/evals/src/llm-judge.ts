import type { GatewayClient, GenerateOptions } from "@platform/sdk";

export interface LlmJudgeExpect {
  criteria: string;
  minScore?: number;
}

export interface LlmJudgeDeps {
  generate: (opts: GenerateOptions) => Promise<{ text: string }>;
}

/** Ask an LLM to score output 0–1 against natural-language criteria. */
export async function gradeWithLlmJudge(
  output: unknown,
  expect: LlmJudgeExpect,
  deps: LlmJudgeDeps,
): Promise<{ passed: boolean; score: number }> {
  const minScore = expect.minScore ?? 0.7;
  const prompt = [
    "You are an eval grader. Score the agent output from 0.0 to 1.0 against the criteria.",
    "Reply with JSON only: {\"score\":number,\"passed\":boolean,\"reason\":string}",
    `Criteria: ${expect.criteria}`,
    `Output: ${JSON.stringify(output)}`,
  ].join("\n");

  const res = await deps.generate({ prompt, maxTokens: 256, temperature: 0 });
  const parsed = parseJudgeJson(res.text);
  const score = Math.max(0, Math.min(1, parsed.score));
  const passed = parsed.passed ?? score >= minScore;
  return { passed: passed && score >= minScore, score };
}

function parseJudgeJson(text: string): { score: number; passed?: boolean } {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const json = JSON.parse(match[0]) as { score?: number; passed?: boolean };
      return { score: Number(json.score ?? 0), passed: json.passed };
    } catch {
      /* fall through */
    }
  }
  const num = text.match(/score["\s:]+([0-9.]+)/i);
  const score = num ? Number(num[1]) : 0;
  return { score };
}
