---
name: smoke-green
description: Run agentd end-to-end smoke until green. Use after platform, API, core, runtime, billing, or smoke script changes.
---

# Keep smoke green

The platform contract is `pnpm smoke` (`scripts/smoke.ts`). Run it after changes to dispatcher, gateway, surfaces, adapters, or CI.

## Commands

```bash
pnpm install
pnpm smoke
```

E2B isolation slice (matches CI matrix):

```bash
# PowerShell
$env:RUNTIME="e2b"; $env:E2B_MOCK="true"; pnpm smoke

# bash
RUNTIME=e2b E2B_MOCK=true pnpm smoke
```

Optional with Postgres:

```bash
$env:DATABASE_URL="postgresql://agentd:agentd@localhost:5432/agentd"
$env:TRACE_STORE="postgres"
pnpm migrate
pnpm smoke
```

## Loop (from awesome-cursor-skills *grinding-until-pass*)

1. Run `pnpm smoke`.
2. On failure, read the first `✗ FAIL:` line and fix minimally.
3. Re-run until green or **10 iterations** — then stop and report blockers.
4. Do not delete smoke assertions to go green; fix behavior or update the test with justification.

## When to extend smoke

- New surface or adapter → add an assertion in `scripts/smoke.ts`.
- New billing/auth invariant → assert without requiring live Stripe/IdP keys when possible.

## Related CI

GitHub Actions runs the same smoke in `.github/workflows/ci.yml` (local + e2b-mock matrix).
