import Link from "next/link";
import { apiFetch } from "../../../../lib/api-server";
import { McpServerCard, type McpServerCardData } from "../../../../components/mcp-server-card";

export default async function AddToClaudePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await apiFetch(`/v1/public/agents/${slug}/mcp`, { next: { revalidate: 60 } });

  if (!res.ok) {
    return (
      <main>
        <h1>Agent not found</h1>
        <p>This agent is not public or does not expose MCP.</p>
        <Link href="/explore">← Explore</Link>
      </main>
    );
  }

  const card = (await res.json()) as McpServerCardData;

  return (
    <main>
      <p style={{ fontSize: 14, color: "#666" }}>
        <Link href="/explore">Explore</Link> / {card.name}
      </p>
      <h1 style={{ marginTop: 8 }}>Add to Claude Desktop</h1>
      <p style={{ color: "#555", maxWidth: 520 }}>
        Click below to open Claude Desktop with this MCP server pre-configured. If nothing happens,
        copy the JSON into{" "}
        <code>claude_desktop_config.json</code> → <code>mcpServers</code>.
      </p>

      <McpServerCard card={card} />

      <p style={{ marginTop: 32, fontSize: 14 }}>
        <Link href={`/a/${slug}`}>Try playground</Link>
      </p>
    </main>
  );
}
