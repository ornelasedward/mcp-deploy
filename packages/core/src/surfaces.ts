import type { ResolvedAgent, Surface } from "@platform/sdk";

export function enabledSurfaces(agent: ResolvedAgent): Surface[] {
  return agent.distribute;
}

export function isEnabled(agent: ResolvedAgent, surface: Surface): boolean {
  return agent.distribute.includes(surface);
}

export interface ConnectOpts {
  /** Shown in snippets (e.g. agd_live_abc… or $API_KEY). */
  apiKey?: string;
  orgId?: string;
}

/** The "Connect" panel: derive the right snippet per ENABLED surface. */
export function connectSnippets(
  agent: ResolvedAgent,
  baseUrl: string,
  opts?: ConnectOpts,
): Record<string, string> {
  const key = opts?.apiKey ?? "$API_KEY";
  const orgHdr = opts?.orgId ? `  -H 'x-org-id: ${opts.orgId}' \\\n` : "";
  const out: Record<string, string> = {};
  if (isEnabled(agent, "http")) {
    out.http = `curl -X POST ${baseUrl}/v1/agents/${agent.slug}/run \\
  -H 'authorization: Bearer ${key}' \\
${orgHdr}  -H 'content-type: application/json' \\
  -d '{ "input": { /* matches input schema */ } }'`;
  }
  if (isEnabled(agent, "mcp")) {
    out.mcp = JSON.stringify(
      { mcpServers: { [agent.slug]: { url: `${baseUrl}/mcp/${agent.slug}` } } },
      null,
      2,
    );
  }
  if (isEnabled(agent, "cli")) {
    out.cli = `npx @platform/run ${agent.slug} --input '{ ... }'`;
  }
  if (isEnabled(agent, "playground")) {
    out.playground = `${baseUrl}/a/${agent.slug}`;
  }
  return out;
}
