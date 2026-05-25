import { CopyButton } from "./copy-button";
import { AddToClaudeButton } from "./add-to-claude-button";

export type McpToolCardData = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  exampleInput: Record<string, unknown>;
  examplePrompt: string;
};

export type McpServerCardData = {
  slug: string;
  name: string;
  description: string;
  mcpUrl: string;
  configJson: string;
  claudeDeepLink: string;
  claudeWebInstallerUrl: string;
  tools: McpToolCardData[];
};

export function McpServerCard({ card }: { card: McpServerCardData }) {
  const tool = card.tools[0];
  if (!tool) return null;

  return (
    <section style={{ marginTop: 28 }}>
      <h2>MCP server</h2>
      <p style={{ color: "#666", fontSize: 14 }}>
        One tool derived from your agent manifest — Claude discovers it with zero config.
      </p>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <AddToClaudeButton deepLink={card.claudeDeepLink} installerUrl={card.claudeWebInstallerUrl} />
        <CopyButton text={card.configJson} label="Copy MCP JSON" />
      </div>

      <div
        style={{
          marginTop: 20,
          border: "1px solid #e4e4e7",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{tool.name}</h3>
        <p style={{ margin: 0, color: "#555", fontSize: 14 }}>{tool.description}</p>
        <p style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
          Endpoint: <code>{card.mcpUrl}</code>
        </p>

        <h4 style={{ marginTop: 16, fontSize: 13, textTransform: "uppercase", color: "#888" }}>
          Input schema
        </h4>
        <pre
          style={{
            background: "#f4f4f5",
            padding: 10,
            fontSize: 12,
            overflow: "auto",
          }}
        >
          {JSON.stringify(tool.inputSchema, null, 2)}
        </pre>

        <h4 style={{ marginTop: 16, fontSize: 13, textTransform: "uppercase", color: "#888" }}>
          Example prompt
        </h4>
        <p style={{ fontSize: 14, fontStyle: "italic", color: "#333" }}>{tool.examplePrompt}</p>
        <pre
          style={{
            marginTop: 8,
            background: "#f4f4f5",
            padding: 10,
            fontSize: 12,
            overflow: "auto",
          }}
        >
          {JSON.stringify(tool.exampleInput, null, 2)}
        </pre>
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 14 }}>Claude Desktop config JSON</summary>
        <pre
          style={{
            marginTop: 8,
            background: "#f4f4f5",
            padding: 10,
            fontSize: 12,
            overflow: "auto",
          }}
        >
          {card.configJson}
        </pre>
      </details>
    </section>
  );
}
