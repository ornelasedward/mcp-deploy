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

**Start here:** P9 (durable + HITL — Inngest primary, run polling, approvals).

Interfaces are fixed; smoke test is the regression net.
