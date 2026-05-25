# Deploy LangGraph in 2 minutes

## 1. Push a repo with LangGraph

```json
// package.json
{
  "dependencies": {
    "@langchain/langgraph": "^0.2.0"
  }
}
```

```ts
// src/graph.ts
import { StateGraph, Annotation } from "@langchain/langgraph";

const State = Annotation.Root({ messages: Annotation<any[]>({ reducer: (a, b) => a.concat(b) }) });

const graph = new StateGraph(State)
  .addNode("echo", (s) => ({ messages: [...s.messages, { role: "assistant", content: "ok" }] }))
  .addEdge("__start__", "echo")
  .compile();

export { graph };
```

No `agent.config.ts` required — agentd detects `@langchain/langgraph` and generates `.agentd/agent.config.ts`.

## 2. Connect GitHub or deploy locally

```bash
pnpm deploy:local ./path/to/your-langgraph-repo
# or push to a linked GitHub repo (webhook)
```

## 3. Run

```bash
curl -X POST http://localhost:8787/v1/agents/<slug>/run \
  -H "x-org-id: org_dev" -H "content-type: application/json" \
  -d '{"input":{"message":"hello"}}'
```

Input is normalized to `{ message: string }` (+ passthrough fields). Output includes `{ reply, result }`.

## Customize

Copy `.agentd/agent.config.ts` to the repo root as `agent.config.ts` and edit schemas/surfaces when you are ready to own the manifest.
