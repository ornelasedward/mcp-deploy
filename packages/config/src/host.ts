export type DeployEnv = "development" | "staging" | "production";

/** Parse `support-triage.agentd.dev` → slug (and optional staging segment). */
export function parseAgentSubdomain(
  host: string,
  platformDomain: string,
): { slug: string; deployEnv: DeployEnv } | null {
  const h = host.split(":")[0]!.toLowerCase();
  const domain = platformDomain.toLowerCase();
  const reserved = new Set(["app", "api", "www"]);

  const stagingMarker = `.staging.${domain}`;
  if (h.endsWith(stagingMarker)) {
    const slug = h.slice(0, -stagingMarker.length);
    if (slug && !slug.includes(".") && !reserved.has(slug)) {
      return { slug, deployEnv: "staging" };
    }
    return null;
  }

  const prodMarker = `.${domain}`;
  if (h.endsWith(prodMarker) && h !== domain && h !== `app.${domain}` && h !== `api.${domain}`) {
    const slug = h.slice(0, -prodMarker.length);
    if (slug && !slug.includes(".") && !reserved.has(slug)) {
      return { slug, deployEnv: "production" };
    }
  }

  return null;
}

/** Default hosted URLs when PLATFORM_DOMAIN is set. */
export function hostedServiceUrls(domain: string, deployEnv: DeployEnv = "production") {
  const prefix = deployEnv === "staging" ? "staging." : "";
  return {
    app: `https://app.${prefix}${domain}`,
    api: `https://api.${prefix}${domain}`,
    agentPlayground: (slug: string) => `https://${slug}.${prefix}${domain}`,
  };
}
