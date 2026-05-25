import type { ResolvedAgent } from "@platform/sdk";
import {
  buildClaudeDesktopDeepLink,
  buildClaudeWebInstallerUrl,
  buildMcpServerConfig,
  type McpServerConfigFile,
} from "./claude-desktop";
import { exampleInputFromSchema, zodInputHint } from "./schema-hint";

export interface McpToolCard {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  exampleInput: Record<string, unknown>;
  examplePrompt: string;
}

export interface McpServerCard {
  slug: string;
  name: string;
  description: string;
  mcpUrl: string;
  config: McpServerConfigFile;
  configJson: string;
  claudeDeepLink: string;
  claudeWebInstallerUrl: string;
  tools: McpToolCard[];
}

export interface McpCardOptions {
  apiKey?: string;
  orgId?: string;
}

/** MCP server card: tools, schema hint, example prompt, Claude install links. */
export function buildMcpServerCard(
  agent: ResolvedAgent,
  apiBaseUrl: string,
  webBaseUrl: string,
  opts?: McpCardOptions,
): McpServerCard {
  const mcpUrl = `${apiBaseUrl.replace(/\/$/, "")}/mcp/${agent.slug}`;
  const headers: Record<string, string> = {};
  if (opts?.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
  if (opts?.orgId) headers["x-org-id"] = opts.orgId;

  const config = buildMcpServerConfig(agent.slug, mcpUrl, headers);
  const configJson = JSON.stringify(config, null, 2);
  const exampleInput = exampleInputFromSchema(agent.input as import("zod").ZodTypeAny);
  const examplePrompt = `Use the ${agent.name} tool with input: ${JSON.stringify(exampleInput)}`;

  const tool: McpToolCard = {
    name: agent.name,
    description: agent.description ?? `Invoke the ${agent.slug} agent`,
    inputSchema: zodInputHint(agent.input as import("zod").ZodTypeAny),
    exampleInput,
    examplePrompt,
  };

  return {
    slug: agent.slug,
    name: agent.name,
    description: agent.description ?? "",
    mcpUrl,
    config,
    configJson,
    claudeDeepLink: buildClaudeDesktopDeepLink(config),
    claudeWebInstallerUrl: buildClaudeWebInstallerUrl(webBaseUrl, agent.slug),
    tools: [tool],
  };
}
