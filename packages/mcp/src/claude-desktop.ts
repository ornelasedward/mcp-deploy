/** Claude Desktop MCP config (streamable HTTP transport). */
export interface McpServerConfigFile {
  mcpServers: Record<
    string,
    {
      url: string;
      headers?: Record<string, string>;
    }
  >;
}

export function buildMcpServerConfig(
  slug: string,
  mcpUrl: string,
  headers?: Record<string, string>,
): McpServerConfigFile {
  const entry: { url: string; headers?: Record<string, string> } = { url: mcpUrl };
  if (headers && Object.keys(headers).length > 0) entry.headers = headers;
  return { mcpServers: { [slug]: entry } };
}

function base64UrlEncode(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * One-click install link for Claude Desktop (custom URL scheme).
 * Falls back to the web installer page when the app is not installed.
 */
export function buildClaudeDesktopDeepLink(config: McpServerConfigFile): string {
  const encoded = base64UrlEncode(JSON.stringify(config));
  return `claude://mcp-install?config=${encoded}`;
}

export function buildClaudeWebInstallerUrl(webBaseUrl: string, slug: string): string {
  return `${webBaseUrl.replace(/\/$/, "")}/add/claude/${slug}`;
}
