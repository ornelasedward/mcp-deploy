# E2B runtime template (P7)

Production runs agent handlers inside [E2B](https://e2b.dev) Firecracker sandboxes. Privileged calls (`ctx.llm`, `ctx.trace`, `ctx.tools`, `ctx.memory`) are proxied to the platform API via the **bridge** — the gateway and secrets never enter the sandbox.

## Architecture

```
┌─────────────────┐         HTTPS          ┌──────────────────┐
│  E2B Sandbox    │ ── POST /internal/bridge/{runId}/… ──▶│  Platform API    │
│  isolated-run   │         x-bridge-token │  Gateway + Trace │
│  agent.handler  │◀────────────────────────│  (budget enforced)│
└─────────────────┘                        └──────────────────┘
```

## Template build (optional)

Use a custom template with Node 22 + `tsx` preinstalled for faster cold starts:

```bash
# Requires E2B_API_KEY
pnpm exec tsx infra/e2b/build-template.ts
```

Set `E2B_TEMPLATE_ID` to the alias returned by the build.

Default sandboxes use `npx -y tsx` on first run (slower).

## Environment

| Variable | Purpose |
|----------|---------|
| `RUNTIME=e2b` | Enable E2B runtime |
| `E2B_API_KEY` | E2B cloud API key |
| `E2B_MOCK=true` | Subprocess isolation without E2B (CI) |
| `BRIDGE_SECRET` | Shared secret for `/internal/bridge` |
| `PLATFORM_BASE_URL` | **Public** API URL reachable from E2B |
| `DEFAULT_EGRESS_ALLOWLIST` | Allowed hosts for tool egress checks |

## CI / local mock

```bash
RUNTIME=e2b E2B_MOCK=true pnpm smoke
```

Mock mode starts a local bridge HTTP server and spawns `isolated-run.ts` in a child process — handler code does not run in the API process.

## Snapshot hydration

`DeployService` stores artifacts under `ARTIFACTS_DIR/<deploymentId>/`. Pass `snapshotRef` on dispatch (from deployment) so `E2BRuntime` uploads files to `/agent` in the sandbox before running the entrypoint.
