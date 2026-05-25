# Deploy Vercel AI SDK in 2 minutes

## 1. Export a runnable entry

```json
{
  "dependencies": {
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0"
  }
}
```

```ts
// src/agent.ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function runAgent({
  input,
}: {
  input: { message: string };
}) {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    prompt: input.message,
  });
  return { reply: text };
}
```

The adapter looks for `ai` / `@ai-sdk/*` and a file using `generateText`, `streamText`, or `runAgent`.

## 2. Deploy

```bash
pnpm deploy:local ./path/to/repo
```

## 3. Call the HTTP surface

```bash
curl -X POST http://localhost:8787/v1/agents/<slug>/run \
  -H "x-org-id: org_dev" -H "content-type: application/json" \
  -d '{"input":{"message":"Hello"}}'
```

## Production

Set `OPENAI_API_KEY` (or your provider keys) in the runtime environment. For budget enforcement via agentd, migrate to a native `agent.config.ts` and use `ctx.llm`.
