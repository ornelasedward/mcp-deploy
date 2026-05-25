# Data residency (enterprise BYOC)

This document describes **where data lives** in a self-hosted agentd deployment so security teams can approve VPC pilots.

## Data stores

| Data | Location | Leaves VPC? |
|------|----------|-------------|
| Runs, `run_events`, orgs, API keys, secrets (encrypted) | Customer Postgres | No (if DB is in-VPC) |
| Agent artifacts (`ARTIFACTS_DIR`) | API volume / object storage you configure | No |
| Project secrets | Postgres (`project_secrets`, AES-GCM) | No |
| LLM prompts/responses | Gateway process memory; usage metadata in Postgres | **Yes** — to LLM provider (Anthropic/OpenAI) when `GATEWAY=live` |
| E2B sandboxes | E2B infrastructure when `RUNTIME=e2b` | **Yes** — code runs on E2B unless you negotiate dedicated region |
| Inngest workflow state | Inngest Cloud (default) or your Inngest deployment | Depends on Inngest hosting choice |
| Stripe billing | Stripe (P13) | **Yes** — only if billing enabled |
| Trace export (Langfuse/OTel) | Configured exporter endpoint | Optional — only if `TRACE_EXPORT` set |

## Control plane vs data plane

- **Control plane:** API, web, dispatcher, budget gateway (stays in your cluster).
- **Data plane (untrusted):** Agent handler code in `runtime` (local subprocess or E2B). Handlers never receive raw provider API keys; they call `ctx.llm` bridged to the platform gateway.

## Retention

- `run_events` is **append-only** (no in-place edits).
- Audit export (`GET /v1/orgs/:orgId/audit/export`) is a read-only snapshot for SIEM/archive.
- Define retention in Postgres (e.g. partition/drop runs older than N days) per your policy — not automated by agentd today.

## Recommended residency patterns

1. **Strict:** Postgres + API + web in one region; `GATEWAY=live` with provider keys; disable E2B (`RUNTIME=local` with network policies) or use mock in air-gapped eval.
2. **Sandboxed prod:** Postgres in-VPC; `RUNTIME=e2b` with E2B enterprise agreement for region pinning.
3. **Observability:** Keep `TRACE_EXPORT=none` or point OTel to in-VPC collector only.

## Compliance notes

- Secrets in traces are redacted before `run_events` persist (see `packages/trace`).
- Cross-tenant isolation: all routes scoped by `orgId` from auth context; registry is org-scoped.
- SAML (P14): authentication happens at your IdP; agentd stores session HMAC only, not passwords.

For questions on a specific pilot, attach this sheet to your security review.
