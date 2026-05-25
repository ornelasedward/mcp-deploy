# agentd — agent deployment platform

One push → **endpoint + MCP + CLI + playground**, with eval scorecards and replayable traces.

## Quick start (local dev)

```bash
pnpm install
pnpm smoke
pnpm api          # API :8787
pnpm web          # Dashboard :3000
pnpm deploy:local # Deploy example agent (needs DATABASE_URL for persistence)
```

- Playground: http://localhost:3000/a/support-triage  
- API health: http://localhost:8787/health  

## Production stack (Docker / Fly)

```bash
cp .env.production.example .env
# set DATABASE_URL (Neon/Supabase), API_KEY, PLATFORM_DOMAIN=agentd.dev
pnpm migrate
docker compose up --build
```

Fly.io + wildcard DNS: **[infra/HOSTING.md](./infra/HOSTING.md)**

| Service | URL |
|---------|-----|
| Web dashboard | http://localhost:3000 |
| API | http://localhost:8787 |
| Postgres | localhost:5432 |

Production defaults: `TRACE_STORE=postgres`, `API_KEY` required, agents loaded from `AGENTS_DIR` + DB.

## Deploy an agent

```bash
# Requires DATABASE_URL (or docker compose postgres)
export DATABASE_URL=postgres://agentd:agentd@localhost:5432/agentd
psql $DATABASE_URL -f packages/db/migrations/0000_init.sql
psql $DATABASE_URL -f packages/db/migrations/0001_handler_path.sql
psql $DATABASE_URL -f packages/db/migrations/0002_auth.sql
psql $DATABASE_URL -f packages/db/migrations/0003_runs_agent_slug.sql
psql $DATABASE_URL -f packages/db/migrations/0004_public_playground.sql
psql $DATABASE_URL -f packages/db/migrations/0005_secrets.sql
psql $DATABASE_URL -f packages/db/migrations/0006_billing.sql

export TRACE_STORE=postgres
export ARTIFACTS_DIR=.artifacts

pnpm api
pnpm deploy:local   # copies into .artifacts/ and registers agent
```

**API deploy**

- Local: `POST /v1/deploy` with `{ "projectDir": "./examples/support-triage" }`
- Git: `POST /v1/deploy` with `{ "cloneUrl": "https://github.com/...", "commitSha": "abc..." }`

**GitHub webhook (P1)** — `POST /v1/webhooks/github`

- Events: `push`, `pull_request` (opened/synchronize)
- Set `GITHUB_WEBHOOK_SECRET` (HMAC verified)
- Optional `GITHUB_TOKEN` for private repo clone
- Artifacts stored under `ARTIFACTS_DIR/<deploymentId>/`

**Preview URLs (P2)**

- Production playground: `/a/{slug}`
- PR preview: `/a/{slug}/pr/{number}`

**Auth + multi-tenant (P3)**

- Dev: send `X-Org-Id` + `X-User-Id` (no Clerk keys)
- Clerk: set `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Org API keys: `agd_live_…` via `POST /v1/orgs/:orgId/api-keys`
- Dashboard: http://localhost:3000/dashboard
- Agents and runs are scoped per org in the API registry

**Product dashboard (P4)**

- `/dashboard` — agents with run stats + last deploy
- `/projects/{id}/agents/{slug}` — metrics, connect panel, runs table
- `/projects/{id}/agents/{slug}/runs/{runId}` — full trace timeline
- Requires `DATABASE_URL` + `TRACE_STORE=postgres` for persisted runs

**Public playground + streaming (P5)**

- Set `public: true` on agent manifest (or toggle in dashboard)
- Share: http://localhost:3000/a/support-triage (no auth)
- `POST /v1/public/agents/:slug/run/stream` — SSE trace + tokens (IP rate limited)
- `POST /v1/agents/:slug/run/stream` — authenticated SSE

**E2B isolation (P7)**

- Handler runs in E2B sandbox (or subprocess when `E2B_MOCK=true`)
- `ctx.llm` / `ctx.trace` / `ctx.tools` bridged via `POST /internal/bridge/{runId}/…`
- Gateway + budget enforcement stay on the platform — not in the sandbox
- Pass `snapshotRef` (artifact dir) on dispatch for hydration

## Architecture

| Package | Role |
|---------|------|
| `sdk` | `defineAgent`, `Ctx`, surface selector |
| `core` | Dispatcher, `buildPlatform`, registry hydration |
| `db` | Postgres schema, deploy service, trace store, usage |
| `build` | Git clone, HMAC, artifact store, deploy URLs |
| `durable` | Local + Inngest async runs |
| `gateway` | Only LLM path + budget breaker |
| `runtime` | Local / E2B isolation |
| `mcp` | Auto-generated MCP server per agent |
| `apps/api` | Hono API — all surfaces |
| `apps/web` | Dashboard + playground + trace replay |

## Env

See `.env.example` (dev) and `.env.production.example` (Docker).

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres — deploy, traces, usage |
| `TRACE_STORE` | `memory` \| `postgres` |
| `API_KEY` | Platform bootstrap key (optional if Clerk/org keys) |
| `AUTH_MODE` | `dev` \| `clerk` \| `keys` \| `mixed` |
| `CLERK_SECRET_KEY` | Verify Clerk JWTs on API |
| `GATEWAY` | `local` \| `live` |
| `AGENTS_DIR` | Scan + deploy agent projects |
| `ARTIFACTS_DIR` | Immutable deploy artifacts (default `.artifacts`) |
| `GITHUB_WEBHOOK_SECRET` | HMAC for `/v1/webhooks/github` |
| `GITHUB_TOKEN` | Clone private repos |

## Product roadmap (all tiers)

Full phased plan: **[PLAN.md](./PLAN.md)** — P0–P14 from shippable SaaS (git deploy, auth, hosting) through production trust (E2B, budgets, HITL) to moat (framework adapters, MCP growth, Stripe, BYOC).

**Hosted platform (P6):** see [infra/HOSTING.md](./infra/HOSTING.md) — Fly.io, Neon/Supabase, wildcard `*.agentd.dev`.

**E2B runtime (P7):** `RUNTIME=e2b` + `infra/e2b/README.md`. CI uses `E2B_MOCK=true` (subprocess isolation).

**Budgets + secrets (P8):** Per-org monthly cap enforced in the gateway (`BudgetStore` + `usage_events`). Project secrets via `PUT /v1/orgs/:orgId/projects/:projectId/secrets/:name` (AES-GCM at rest with `SECRETS_ENCRYPTION_KEY`). Injected as `ctx.secrets` and sandbox env — never written to `run_events`.

**Durable + HITL (P9):** Production uses `DURABLE=inngest` — HTTP runs return `202` + `runId` (poll `GET /v1/agents/:slug/runs/:id`). Agents call `ctx.step.waitForEvent("approval")`; resume with `POST .../runs/:id/resume`. Dashboard shows suspended runs with an Approve button. Dev: `?async=1` or in-process background queue without Inngest keys.

**Observability + eval gates (P10):** `TRACE_EXPORT=langfuse|otel` fans out `run_events`. Eval cases support `llm-judge` grader. Deploy/webhook runs evals, blocks on regression (`EVAL_REGRESSION_DELTA`), and posts a PR comment with score diff vs production baseline.

**Framework adapters (P11):** Deploy LangGraph, OpenAI Agents, Mastra, or Vercel AI SDK repos without hand-writing `agent.config.ts` — build generates `.agentd/agent.config.ts`. See [docs/frameworks](./docs/frameworks/README.md).

**MCP growth (P12):** Public directory at `/explore` (agents with `public: true` + MCP). MCP server card + `claude://mcp-install?config=…` deep link on `/add/claude/{slug}`. API: `GET /v1/public/directory`, `GET /v1/agents/:slug/mcp`.

**Billing (P13):** `packages/billing` — Stripe Checkout (platform fee) + **Billing Meters** for LLM pass-through (micro-USD). Free tier: 100 runs/month. API: `GET /v1/orgs/:orgId/billing`, checkout/portal, `POST /v1/webhooks/stripe`. Dashboard: `/dashboard/billing`. Setup: [infra/billing/STRIPE.md](./infra/billing/STRIPE.md).

**Enterprise BYOC (P14):** Helm chart at `infra/helm/agentd` (API + web + Postgres + ingress). SAML SSO (`/v1/auth/saml/*`), audit export (`/v1/orgs/:orgId/audit/export`). See [infra/byoc/README.md](./infra/byoc/README.md) and [DATA_RESIDENCY.md](./infra/byoc/DATA_RESIDENCY.md).

**Roadmap complete (P0–P14).** Extend tiers per product needs; keep `pnpm smoke` green.

Interfaces are fixed; smoke test is the regression net.

**CI (GitHub Actions):** `.github/workflows/ci.yml` — `pnpm smoke` (local + E2B mock matrix), web build, Helm lint. Uses `packageManager` from `package.json` (`pnpm@11.3.0`). Optional: `.github/workflows/e2e.yml` on PRs touching runtime code.

**Cursor AI:** Project rules in `.cursor/rules/` and skills in `.cursor/skills/` — see [docs/CURSOR_AI.md](./docs/CURSOR_AI.md) (curated from awesome-cursorrules + awesome-cursor-skills).
