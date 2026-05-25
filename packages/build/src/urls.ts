/** P2: canonical URLs for production vs preview deployments. */
export interface AgentUrlOptions {
  slug: string;
  apiBaseUrl: string;
  webBaseUrl: string;
  /** When set, playground uses https://{slug}.{domain} (P6 wildcard DNS). */
  platformDomain?: string;
  deployEnv?: "staging" | "production";
  isPreview?: boolean;
  prNumber?: number;
}

export interface AgentUrls {
  http: string;
  mcp: string;
  playground: string;
  cli: string;
  preview?: string;
}

export function buildAgentUrls(opts: AgentUrlOptions): AgentUrls {
  const api = opts.apiBaseUrl.replace(/\/$/, "");
  const web = opts.webBaseUrl.replace(/\/$/, "");
  const base = {
    http: `${api}/v1/agents/${opts.slug}/run`,
    mcp: `${api}/mcp/${opts.slug}`,
    cli: `npx @platform/run ${opts.slug}`,
  };

  const prefix = opts.deployEnv === "staging" ? "staging." : "";
  const hostedPlayground = opts.platformDomain
    ? `https://${opts.slug}.${prefix}${opts.platformDomain}`
    : null;

  if (opts.isPreview && opts.prNumber != null) {
    const playground = hostedPlayground ?? `${web}/a/${opts.slug}/pr/${opts.prNumber}`;
    return { ...base, playground, preview: playground };
  }

  return { ...base, playground: hostedPlayground ?? `${web}/a/${opts.slug}` };
}
