import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { ResolvedAgent } from "@platform/sdk";
import type { Dispatch } from "@platform/core";
import type { Budget } from "@platform/gateway";

export interface McpDeps {
  dispatch: Dispatch;
  orgId: string;
  budget: Budget;
}

/**
 * THE MAGIC MOMENT. From the agent manifest alone, generate an MCP server exposing the agent
 * as a single tool. Any MCP client (Claude, etc.) can now discover and call it with zero config.
 * The tool's input schema IS the agent's input schema — one contract, derived.
 */
export function generateMcpServer(agent: ResolvedAgent, deps: McpDeps): McpServer {
  const server = new McpServer({ name: agent.slug, version: "1.0.0" });

  // The MCP SDK accepts a Zod raw shape; we expose the agent input under `input`.
  server.tool(
    agent.name,
    agent.description ?? `Invoke the ${agent.name} agent`,
    { input: agent.input as unknown as z.ZodTypeAny },
    async ({ input }: { input: unknown }) => {
      const result = await deps.dispatch({
        agent, input, source: "mcp", orgId: deps.orgId, budget: deps.budget,
      });
      if (result.status === "failed") {
        return { isError: true, content: [{ type: "text", text: result.error ?? "run failed" }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(result.output) }] };
    },
  );

  return server;
}

/**
 * Stateless MCP over Streamable HTTP (Web Standard Request/Response).
 * Works with Hono via `return handleMcpHttp(agent, deps, c.req.raw)`.
 */
export async function handleMcpHttp(
  agent: ResolvedAgent,
  deps: McpDeps,
  request: Request,
): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = generateMcpServer(agent, deps);
  await server.connect(transport);
  return transport.handleRequest(request);
}
