import { parseAgentSubdomain } from "@platform/config";

export function agentSlugFromHost(host: string): string | null {
  const domain = process.env.PLATFORM_DOMAIN ?? process.env.NEXT_PUBLIC_PLATFORM_DOMAIN;
  if (!domain) return null;
  const parsed = parseAgentSubdomain(host, domain);
  return parsed?.slug ?? null;
}
