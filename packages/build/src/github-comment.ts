import type { EvalGateResult } from "@platform/evals";
import type { EvalResult } from "@platform/evals";
import type { AgentUrls } from "./urls";

export function formatEvalPrComment(opts: {
  slug: string;
  results: EvalResult[];
  gate: EvalGateResult;
  baseline: Map<string, number>;
  urls: AgentUrls;
}): string {
  const lines = [
    "## Agentd eval report",
    "",
    `Agent **${opts.slug}** · ${opts.results.filter((r) => r.passed).length}/${opts.results.length} cases passed`,
    opts.gate.passed ? "✅ **Gate passed**" : "❌ **Gate failed — deploy blocked**",
    "",
    "| Case | Score | Baseline | Δ | Status |",
    "|------|-------|----------|---|--------|",
  ];

  for (const r of opts.results) {
    const base = opts.baseline.get(r.name);
    const baseStr = base != null ? base.toFixed(2) : "—";
    const delta =
      base != null ? `${(r.score - base >= 0 ? "+" : "")}${(r.score - base).toFixed(2)}` : "—";
    const status = r.passed ? "✅" : "❌";
    lines.push(`| ${r.name} | ${r.score.toFixed(2)} | ${baseStr} | ${delta} | ${status} |`);
  }

  if (opts.gate.failures.length > 0) {
    lines.push("", "**Failures:**");
    for (const f of opts.gate.failures) {
      if (f.reason === "regression") {
        lines.push(`- \`${f.name}\`: score ${f.score.toFixed(2)} < baseline ${f.baseline?.toFixed(2)}`);
      } else {
        lines.push(`- \`${f.name}\`: grader failed (score ${f.score.toFixed(2)})`);
      }
    }
  }

  lines.push(
    "",
    `**Preview playground:** ${opts.urls.playground}`,
    `**API:** ${opts.urls.http}`,
  );

  return lines.join("\n");
}

/** Post (or update) a comment on a GitHub PR. Requires repo scope `issues: write`. */
export async function postGithubPrComment(opts: {
  token: string;
  repoFullName: string;
  prNumber: number;
  body: string;
}): Promise<void> {
  const [owner, repo] = opts.repoFullName.split("/");
  if (!owner || !repo) throw new Error(`invalid repo: ${opts.repoFullName}`);

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${opts.prNumber}/comments`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ body: opts.body }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub comment failed ${res.status}: ${text.slice(0, 300)}`);
  }
}
