#!/usr/bin/env node
/**
 * The universal CLI SURFACE: `npx @platform/run <agent> --input '{...}'`.
 * It is a thin client of the same Dispatcher (via the HTTP endpoint) — no new runtime.
 * Streams the run output + trace to the terminal. Shareable as a one-liner.
 */
const BASE = process.env.PLATFORM_BASE_URL ?? "http://localhost:8787";
const API_KEY = process.env.PLATFORM_API_KEY ?? "dev";

function parseArgs(argv: string[]) {
  const [slug, ...rest] = argv;
  let input: unknown = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--input") input = JSON.parse(rest[++i] ?? "{}");
    else if (rest[i]?.startsWith("--")) {
      const key = rest[i]!.slice(2);
      (input as Record<string, unknown>)[key] = rest[++i];
    }
  }
  return { slug, input };
}

async function main() {
  const { slug, input } = parseArgs(process.argv.slice(2));
  if (!slug) {
    console.error("usage: platform-run <agent-slug> --input '{...}'");
    process.exit(1);
  }
  const res = await fetch(`${BASE}/v1/agents/${slug}/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  const body = await res.json();
  if (!res.ok || body.status === "failed") {
    console.error("✗ run failed:", body.error ?? res.statusText);
    process.exit(1);
  }
  console.log("✓ output:", JSON.stringify(body.output, null, 2));
  console.log(`  run ${body.runId} · $${(body.costUsd ?? 0).toFixed(4)} · ${body.durationMs}ms`);
}

main().catch((e) => { console.error(e); process.exit(1); });
