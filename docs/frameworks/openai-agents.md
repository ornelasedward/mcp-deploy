# Deploy OpenAI Agents SDK in 2 minutes

## 1. Repo layout

```json
{
  "dependencies": {
    "@openai/agents": "^0.1.0"
  }
}
```

```ts
// src/agent.ts
import { Agent } from "@openai/agents";

export const agent = new Agent({
  name: "Assistant",
  instructions: "You are helpful.",
});
```

Export name `agent` (or `default`) — the adapter runs it via `Runner`.

## 2. Deploy

```bash
export OPENAI_API_KEY=sk-...
pnpm deploy:local ./path/to/repo
```

## 3. Invoke

```bash
curl -X POST http://localhost:8787/v1/agents/<slug>/run \
  -H "x-org-id: org_dev" -H "content-type: application/json" \
  -d '{"input":{"message":"Summarize our refund policy"}}'
```

Platform gateway billing applies when you route model calls through `ctx.llm` in a native manifest; adapted agents use your SDK’s own API keys by default.

## Tip

Add `agent.config.ts` at the repo root when you want full control of surfaces, evals, and `ctx.llm` routing.
