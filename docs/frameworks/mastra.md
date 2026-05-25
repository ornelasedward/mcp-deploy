# Deploy Mastra in 2 minutes

## 1. Repo layout

```json
{
  "dependencies": {
    "@mastra/core": "^0.1.0"
  }
}
```

```ts
// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { myAgent } from "./agents/support";

export const mastra = new Mastra({ agents: { support: myAgent } });
```

The adapter picks the first registered Mastra agent and calls `.generate()`.

## 2. Deploy

```bash
pnpm deploy:local ./path/to/mastra-app
```

## 3. Run

```bash
curl -X POST http://localhost:8787/v1/agents/<slug>/run \
  -H "x-org-id: org_dev" -H "content-type: application/json" \
  -d '{"input":{"message":"Status of ticket #42"}}'
```

## Next steps

- Add eval cases under `evals/cases.json` once you add a native `agent.config.ts`
- Enable MCP/CLI surfaces in the generated config under `.agentd/`
