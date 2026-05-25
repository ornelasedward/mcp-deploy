# Hosted platform (P6)

Deploy agentd to production without localhost. Supports **Fly.io**, **Docker Compose**, and managed Postgres (**Neon** / **Supabase**).

## Architecture

| Host | Service |
|------|---------|
| `app.agentd.dev` | Dashboard (Next.js) |
| `api.agentd.dev` | Hono API + Inngest (`/api/inngest`) |
| `{slug}.agentd.dev` | Public agent playground (wildcard → `/a/{slug}`) |
| `app.staging.agentd.dev` | Staging dashboard |
| `api.staging.agentd.dev` | Staging API |
| `{slug}.staging.agentd.dev` | Staging agent playgrounds |

TLS terminates at the edge (Fly/Railway/Cloudflare). Set secrets via the platform vault (`fly secrets`, Railway variables) — never commit `.env` with real keys.

## 1. Postgres (Neon or Supabase)

1. Create a project and copy the **pooled** connection string.
2. Run migrations:

```bash
export DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/agentd?sslmode=require"
pnpm migrate
```

Neon and Supabase both work with `TRACE_STORE=postgres`.

## 2. Environment

Copy and edit:

- `.env.production.example` — production
- `.env.staging.example` — staging mirror

Required in production:

- `DATABASE_URL`
- `API_KEY` or `CLERK_SECRET_KEY`
- `PLATFORM_BASE_URL` / `WEB_BASE_URL` (https URLs)
- `PLATFORM_DOMAIN=agentd.dev` (enables wildcard playgrounds)

## 3. Fly.io

```bash
# API
fly apps create agentd-api
fly secrets set DATABASE_URL=... API_KEY=... INNGEST_SIGNING_KEY=... --app agentd-api
fly deploy --config infra/fly/api/fly.toml  # run from repo root

# Web
fly apps create agentd-web
fly certs add app.agentd.dev --app agentd-web
fly certs add "*.agentd.dev" --app agentd-web
fly deploy --config infra/fly/web/fly.toml
```

Point DNS:

- `api.agentd.dev` → `agentd-api.fly.dev`
- `app.agentd.dev` and `*.agentd.dev` → `agentd-web.fly.dev`

Register Inngest against `https://api.agentd.dev/api/inngest`.

## 4. Docker Compose (single VM)

```bash
cp .env.production.example .env
docker compose up --build
```

Staging overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up --build
```

## 5. Local wildcard testing

Add to `/etc/hosts` (or Windows `hosts`):

```
127.0.0.1 app.agentd.dev api.agentd.dev support-triage.agentd.dev
```

```bash
PLATFORM_DOMAIN=agentd.dev \
PLATFORM_BASE_URL=http://api.agentd.dev:8787 \
WEB_BASE_URL=http://app.agentd.dev:3000 \
pnpm api
# separate terminal, same PLATFORM_DOMAIN for web
pnpm web
```

Open http://support-triage.agentd.dev:3000 — middleware rewrites to the playground.

## Exit criteria

- `https://app.agentd.dev` serves the dashboard
- `https://support-triage.agentd.dev` serves a deployed public agent
- API health: `https://api.agentd.dev/health`
