---
name: ci-triage
description: Fix failed GitHub Actions for agentd — smoke, web build, helm lint. Use when CI is red on a PR.
---

# CI triage (agentd)

Adapted from [awesome-cursor-skills parallel-ci-triage](https://github.com/spencerpauly/awesome-cursor-skills).

## Jobs in this repo

| Job | Local repro | Common fixes |
|-----|-------------|--------------|
| `smoke (local)` | `pnpm smoke` | Dispatcher, gateway, registry, smoke assertions |
| `smoke (e2b-mock)` | `RUNTIME=e2b E2B_MOCK=true pnpm smoke` | `packages/runtime`, bridge |
| `build-web` | `pnpm --filter @platform/web build` | Server/client import split (`api-server` vs `api-client`), Clerk in client |
| `helm-lint` | `helm lint ./infra/helm/agentd` | Chart templates, values |

## Workflow

1. Fetch logs: `gh run list --limit 5` then `gh run view <RUN_ID> --log-failed`.
2. Fix the **first** failing job locally.
3. Re-run the exact command that failed in CI.
4. When green locally, push and `gh run watch`.

## pnpm version errors

If CI says multiple pnpm versions: remove `version:` from `pnpm/action-setup` and rely on root `packageManager` field.

## Do not

- Skip smoke with `continue-on-error` to merge.
- Pin pnpm 9 in Actions while `package.json` says `pnpm@11.3.0`.
