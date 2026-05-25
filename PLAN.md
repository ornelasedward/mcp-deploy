# agentd — Master product plan (all tiers)

This document sequences **Tier 1 (shippable)**, **Tier 2 (production trust)**, and **Tier 3 (competitive moat)** into concrete phases. Each phase has exit criteria and maps to packages in this monorepo.

**Current baseline:** dispatcher spine, four surfaces, local deploy, Postgres traces, MCP HTTP, Inngest stub, minimal dashboard. See `pnpm smoke`.

---

## North-star definition of done

A stranger can:

1. Sign up → create org/project → connect GitHub
2. Push code → preview agent URL on PR + eval scorecard
3. Merge → production URL + MCP/CLI/playground from Connect panel
4. Share public playground → run without account (rate-limited)
5. View traces, cost/run, org budget in dashboard
6. Trust isolation (E2B), durable long runs, deploy blocked on eval regression

---

## Phase map (build in order; some parallelizable)

| Phase | Tier | Theme | Exit criteria |
|-------|------|--------|----------------|
| **P0** | — | Harden baseline | `pnpm smoke` + docker compose green; CI workflow |
| **P1** | T1 | Git → build → artifact | Push to repo deploys; handler loaded from artifact not cwd |
| **P2** | T1 | Preview + production URLs | PR preview URL; merge promotes; idempotent by commit SHA |
| **P3** | T1 | Auth + multi-tenant | Clerk; org/project; per-org API keys; UI project list |
| **P4** | T1 | Product dashboard | Runs, deploys, costs, connect, surface toggles |
| **P5** | T1 | Public share + streaming | Public playground; SSE run stream in UI |
| **P6** | T1 | Hosted platform | Fly/Railway; HTTPS; `*.agentd.dev` routing |
| **P7** | T2 | E2B runtime | Untrusted code only in sandbox; ctx RPC bridge |
| **P8** | T2 | Budgets + secrets | Org monthly cap; project secrets; usage dashboard |
| **P9** | T2 | Durable + HITL | Inngest primary for long runs; `waitForEvent`; run polling UI |
| **P10** | T2 | Observability + eval gates | OTel/Langfuse; llm-judge; block deploy on regression |
| **P11** | T3 | Framework adapters | OpenAI Agents SDK, Mastra, LangGraph import paths |
| **P12** | T3 | MCP growth loop | Claude one-click; docs; optional registry |
| **P13** | T3 | Billing | Stripe platform fee + LLM pass-through line items |
| **P14** | T3 | Enterprise BYOC | Self-host chart; customer VPC; audit exports |

---

## P0 — Harden baseline (now)

**Packages:** all  
**Tasks:**

- [x] GitHub Actions: `pnpm install`, `pnpm smoke`, `pnpm --filter @platform/web build`
- [ ] `pnpm typecheck` script on every package
- [ ] Fix docker-compose web build (full monorepo context)
- [x] Document env matrix in README

**Exit:** CI green on every PR.

---

## P1 — Git → build → artifact (Tier 1 core)

**Packages:** `packages/build` (new), `packages/db`, `apps/api`, `packages/cli`

**Tasks:**

- [x] GitHub webhook `push` + `pull_request` (`POST /v1/webhooks/github`)
- [x] Verify `X-Hub-Signature-256` (HMAC)
- [x] Clone repo at `commitSha` into `ARTIFACTS_DIR/<deploymentId>/`
- [x] Build: copy + `findAgentRoot` → `snapshotRef` (Nixpacks later)
- [x] `DeployService` uses artifact store; git deploy does not use dev cwd
- [ ] `pnpm install` in cloned repo when `package.json` present (standalone repos)

**Exit:** Push to a test repo deploys agent; API restart still serves agent from DB + artifact.

---

## P2 — Preview + production URLs (Tier 1)

**Packages:** `packages/db`, `apps/api`, `apps/web`

**Tasks:**

- [x] URL scheme (path): `/a/{slug}` production, `/a/{slug}/pr/{n}` preview
- [ ] Router: wildcard DNS `*.agentd.dev` (P6)
- [x] `isPreview` + `prNumber` on deployments
- [x] Production push sets `isPreview: false` via webhook parser
- [x] Evals on deploy; stored in `eval_results`

**Exit:** PR gets comment with preview link + eval summary; merge updates production.

---

## P3 — Auth + multi-tenant (Tier 1)

**Packages:** `apps/web`, `apps/api`, `packages/db`

**Tasks:**

- [x] Clerk (or WorkOS): sign up / sign in
- [x] Map Clerk `orgId` → `orgs` table
- [x] Projects CRUD API + UI
- [x] Per-org API keys (hashed in DB)
- [x] Replace static `DEFAULT_ORG_ID` with session org
- [x] RBAC: owner / member (deploy vs run only)

**Exit:** Two orgs cannot see each other's agents or runs.

---

## P4 — Product dashboard (Tier 1)

**Packages:** `apps/web`

**Tasks:**

- [x] `/dashboard` — projects, agents, last deploy status
- [x] `/projects/[id]/agents/[slug]` — runs table, avg cost, error rate
- [x] `/projects/[id]/agents/[slug]/runs/[runId]` — full trace replay (timeline UI)
- [x] Connect panel: copy MCP JSON, curl, CLI with real keys
- [x] Surface toggles: PATCH manifest `distribute` without redeploy (optional v1.1)

**Exit:** No need to curl API for day-to-day ops.

---

## P5 — Public share + streaming (Tier 1)

**Packages:** `apps/api`, `apps/web`

**Tasks:**

- [x] `playground` surface: optional `public: true` on agent
- [x] Rate limit public runs by IP (Redis or in-memory dev)
- [x] `POST /v1/agents/:slug/run/stream` — SSE tokens + trace events
- [x] Playground UI consumes SSE (live trace)

**Exit:** Shareable link works for anonymous users; demo video possible.

---

## P6 — Hosted platform (Tier 1)

**Infra:** Fly.io / Railway / AWS

**Tasks:**

- [x] Production Postgres (Neon/Supabase)
- [x] API + worker (Inngest) + web services
- [x] Wildcard DNS `*.agentd.dev`
- [x] TLS, secrets via platform vault
- [x] Staging environment mirroring prod

**Exit:** `app.agentd.dev` runs without localhost.

---

## P7 — E2B runtime (Tier 2)

**Packages:** `packages/runtime`, `packages/core`

**Tasks:**

- [x] E2B template with agent entrypoint
- [x] Snapshot hydration from `snapshotRef`
- [x] RPC bridge: sandbox calls `ctx.llm`, `ctx.trace`, `ctx.tools` on platform side
- [x] Network egress allowlist per org
- [x] `RUNTIME=e2b` in production; smoke test with mock E2B in CI

**Exit:** Handler code never executes in API process in prod.

---

## P8 — Budgets + secrets (Tier 2)

**Packages:** `packages/gateway`, `packages/db`, `apps/api`, `apps/web`

**Tasks:**

- [x] Load `budgets` row per org; enforce monthly cap in gateway
- [x] `usage_events` aggregation → dashboard “spend this month”
- [x] Project secrets API (encrypt at rest); inject into `Ctx` / sandbox env
- [x] Hard-stop vs soft-cap modes

**Exit:** Run cannot exceed org monthly budget; secrets never in `run_events`.

---

## P9 — Durable + HITL (Tier 2)

**Packages:** `packages/durable`, `apps/api`, `apps/web`

**Tasks:**

- [x] Default long runs to Inngest (`DURABLE=inngest` in prod)
- [x] `POST /v1/agents/:slug/run` returns `202` + `runId`; poll `GET .../runs/:id`
- [x] `waitForEvent` + `POST .../runs/:id/resume` for approvals
- [x] UI: suspended state, approve button

**Exit:** 10-minute agent run survives API restart; human can approve mid-run.

---

## P10 — Observability + eval gates (Tier 2)

**Packages:** `packages/evals`, `packages/trace`, `packages/build`

**Tasks:**

- [x] Export traces to Langfuse or OTel backend
- [x] `llm-judge` grader in `packages/evals`
- [x] Deploy pipeline: fail if score < baseline (configurable delta)
- [x] PR comment: eval diff vs main

**Exit:** Bad deploy cannot reach production.

---

## P11 — Framework adapters (Tier 3)

**Packages:** `packages/detect`, `packages/sdk`, `packages/build`

**Tasks:**

- [ ] Detect: OpenAI Agents SDK, Mastra, LangGraph, Vercel AI SDK
- [ ] Import adapters produce `defineAgent`-compatible manifest
- [ ] Docs per framework “deploy in 2 minutes”

**Exit:** User does not rewrite agent to `defineAgent` manually if already on supported SDK.

---

## P12 — MCP growth loop (Tier 3)

**Packages:** `packages/mcp`, `apps/web`, marketing site

**Tasks:**

- [ ] “Add to Claude Desktop” deep link with MCP JSON
- [ ] Public agent directory (opt-in)
- [ ] MCP server card: tools list, schema, example prompt

**Exit:** 40-second demo: push → Claude calls tool with zero config.

---

## P13 — Billing (Tier 3)

**Packages:** `apps/api`, `apps/web`, `packages/db`

**Tasks:**

- [ ] Stripe: subscription + metered LLM pass-through
- [ ] Invoice line items: platform fee vs model cost
- [ ] Free tier limits (runs/month, surfaces)

**Exit:** Can charge without manual invoicing.

---

## P14 — Enterprise BYOC (Tier 3)

**Deliverables:** Helm chart, docs

**Tasks:**

- [ ] Self-host bundle: API + web + Postgres + Inngest + optional E2B
- [ ] SSO (SAML)
- [ ] Audit log export, data residency notes

**Exit:** Enterprise pilot can deploy in their VPC.

---

## Parallel workstreams (after P1)

| Stream A | Stream B | Stream C |
|----------|----------|----------|
| P2 URLs | P3 Auth | P7 E2B |
| P4 Dashboard | P5 Streaming | P8 Budgets |
| P6 Hosting | P9 HITL | P10 Evals |

---

## Package additions (planned)

| Package | Responsibility |
|---------|----------------|
| `packages/build` | Nixpacks/OCI, clone, artifact layout |
| `packages/auth` | Clerk session → org context |
| `packages/billing` | Stripe webhooks, usage metering |

---

## What NOT to build until P6

- Multi-region
- GPU nodes
- Per-agent npm publish
- Custom VPC peering (until P14)

---

## Cursor prompts (copy-paste per phase)

**P1:** Implement GitHub App webhook with HMAC verification, clone at commit SHA, Nixpacks build into `ARTIFACTS_DIR`, wire `DeployService` to artifact path only.

**P3:** Add Clerk auth to `apps/web`, org-scoped API routes, per-org API keys in Postgres.

**P7:** Complete `E2BRuntime`: snapshot hydration, ctx.llm/trace RPC bridge, keep gateway on platform side.

**P13:** Stripe Checkout + metered `usage_events` billing with separate platform fee line item.

---

## Success metrics by tier

| Tier | Metric |
|------|--------|
| T1 | Time from signup to first successful deploy < 10 min |
| T2 | Zero cross-tenant leaks; 99.9% run durability for jobs < 1h |
| T3 | Paid conversion; MCP install rate; NPS on cost transparency |

---

*Update this file when a phase ships. Keep `AGENTS.md` invariants unchanged.*
