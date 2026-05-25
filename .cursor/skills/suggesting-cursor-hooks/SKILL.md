---
name: suggesting-cursor-hooks
description: Suggest Cursor hooks when the user repeatedly asks to run smoke, typecheck, or lint after edits.
---

# Suggest Cursor hooks

From [awesome-cursor-skills suggesting-cursor-hooks](https://github.com/spencerpauly/awesome-cursor-skills).

## When to suggest

User asks **twice or more** in a session to:

- `pnpm smoke`
- `pnpm --filter @platform/web build`
- `pnpm typecheck:ci`

## Suggestion template

> You've asked to run smoke after edits a few times. Want a Cursor hook to run `pnpm smoke` on stop or after TS changes in `packages/core`?

## agentd-friendly hook example

```json
{
  "hooks": [
    {
      "event": "stop",
      "command": "pnpm smoke",
      "description": "Verify platform spine after agent turn"
    }
  ]
}
```

Keep hooks **fast** (<2 min) or scope by glob. Merge with existing `.cursor/hooks.json` — do not overwrite user hooks.

Read the create-hook skill if implementing: `~/.cursor/skills-cursor/create-hook/SKILL.md`.
