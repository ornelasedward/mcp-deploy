# Working in this repo (read before generating code)

Cursor: see `.cursor/rules/` (always-on `agentd-platform.mdc`) and `.cursor/skills/` — index in [docs/CURSOR_AI.md](./docs/CURSOR_AI.md). Sourced from [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) and [awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills).

## Golden rules
1. **Contracts first.** The source of truth is `packages/sdk`. Do not change `AgentManifest`,
   `Ctx`, or `Surface` without updating every consumer and the smoke test.
2. **One package = one context.** Each `packages/*` has a single responsibility (see README
   table). Don't reach across boundaries; depend on the published interface only.
3. **Build against interfaces, never vendors.** New capabilities go behind `Runtime`,
   `DurableEngine`, `Gateway`, or `TraceStore`. Add a `Local*` impl AND the vendor impl.
4. **The Dispatcher is the only execution path.** Every surface (http/mcp/cli/playground/eval)
   must funnel through `core/createDispatcher`. Never run a handler directly from a surface.
5. **The gateway is the only model path.** All LLM calls go through `ctx.llm` so the budget
   circuit breaker and cost logging always apply. No direct provider SDK calls in agent code.
6. **Keep it green.** Run `pnpm smoke` and `pnpm typecheck:ci` after every change. If you add a
   surface or adapter, add a smoke assertion for it.

## Bulletproofing invariants (do not weaken)
- Untrusted code runs only in `runtime` (E2B in prod) — never in the API process.
- `run_events` is append-only; redact secrets before persisting (see `trace`).
- Run creation is idempotent (`idempotencyKey`); webhooks dedupe by delivery id / commit sha.
- Per-run + per-org budget caps are enforced in the gateway, not the agent.

## Good first tasks
- Wire `pnpm typecheck:ci` green on `apps/api` and `packages/core` (see CI allowlist in `scripts/typecheck.ts`).
- Add Nixpacks OCI build + per-repo paths on GitHub webhook.
- Postgres integration smoke for `GET /v1/orgs/:orgId/audit/export`.
- Production Stripe + SAML IdP wiring for a pilot customer.
