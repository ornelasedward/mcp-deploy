/** Per-org network egress allowlist (hostnames). LLM traffic stays on platform bridge. */
export function parseEgressAllowlist(raw?: string): string[] {
  if (!raw) return ["api.anthropic.com", "api.openai.com"];
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEgressHost(hostname: string, allowlist: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function isAllowedEgressUrl(url: string, allowlist: string[]): boolean {
  try {
    return isAllowedEgressHost(new URL(url).hostname, allowlist);
  } catch {
    return false;
  }
}
