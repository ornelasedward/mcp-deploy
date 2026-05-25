# Framework import adapters

agentd can deploy agents **without** a hand-written `agent.config.ts` when we detect a supported SDK. The build step writes `.agentd/agent.config.ts` that bridges your entry file to the platform contract (`defineAgent`).

| Framework | Detected via | Entry convention |
|-----------|--------------|------------------|
| **Native** | `agent.config.ts` | You own the manifest (recommended for full control) |
| **LangGraph** | `@langchain/langgraph` in `package.json` | `StateGraph` in `src/graph.ts` (or `langgraph.json`) |
| **OpenAI Agents** | `@openai/agents` | `Agent` export in `src/agent.ts` |
| **Mastra** | `@mastra/core` | `Mastra` instance in `src/mastra/index.ts` |
| **Vercel AI SDK** | `ai` or `@ai-sdk/*` | `generateText` / `streamText` or `export async function runAgent` |

Guides:

- [LangGraph](./langgraph.md)
- [OpenAI Agents SDK](./openai-agents.md)
- [Mastra](./mastra.md)
- [Vercel AI SDK](./vercel-ai.md)

After first deploy, tune `input` / `output` schemas in `.agentd/agent.config.ts` or add a native `agent.config.ts` at the repo root.
