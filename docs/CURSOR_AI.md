# Cursor rules & skills (agentd)

Project-specific AI guidance lives in `.cursor/` so Cursor picks it up automatically.

## Rules (`.cursor/rules/*.mdc`)

Adapted primarily from [awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules), tailored to this monorepo.

| Rule | Source inspiration | When it applies |
|------|-------------------|-----------------|
| `agentd-platform.mdc` | AGENTS.md + platform docs | **Always** |
| `typescript.mdc` | awesome-cursorrules `typescript.mdc` | `**/*.{ts,tsx}` |
| `anti-overengineering.mdc` | `anti-overengineering.mdc` | Broad |
| `code-discipline.mdc` | `anti-sycophancy-code-discipline` | Broad |
| `postgresql-drizzle.mdc` | `postgresql.mdc` | `packages/db` |
| `hono-api.mdc` | Hono SaaS rule + agentd | `apps/api` |
| `nextjs-web.mdc` | Next.js practices + agentd | `apps/web` |
| `git-commits.mdc` | Conventional commits rule | Commits / PRs |
| `pr-review.mdc` | PR review rule + security | Reviews |
| `ci-smoke.mdc` | CI + smoke | `.github/`, `scripts/smoke.ts` |

`AGENTS.md` remains the canonical architecture doc; rules reinforce it in Cursor.

## Skills (`.cursor/skills/*/SKILL.md`)

Adapted from [awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills) where rules do not cover workflows:

| Skill | Based on | Use when |
|-------|----------|----------|
| `smoke-green` | grinding-until-pass + api-smoke-testing | After platform changes |
| `ci-triage` | parallel-ci-triage | GitHub Actions failed |
| `suggesting-cursor-hooks` | suggesting-cursor-hooks | User keeps re-asking for smoke |

## Not vendored (use upstream if needed)

- Framework-specific rules (Vue, Django, etc.) — not relevant.
- `github-code-quality` regex JSON — replaced by `code-discipline.mdc` prose.
- Stripe/Auth/Analytics skills — we have `infra/billing/STRIPE.md` and built-in billing routes.

## Contributing

When adding a rule from awesome-cursorrules:

1. Copy the `.mdc` into `.cursor/rules/` with a clear name.
2. Trim stack-specific content (Angular, Cloudflare-only) unless we adopt that stack.
3. Add agentd invariants (dispatcher, gateway, smoke).
4. Credit the upstream repo in this file.
