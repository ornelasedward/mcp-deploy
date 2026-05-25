# Enterprise BYOC (P14)

Deploy agentd entirely inside your VPC — no multi-tenant SaaS dependency. Suitable for regulated industries and pilots that require data residency control.

## Bundle

| Component | Helm / Compose | Notes |
|-----------|----------------|-------|
| API | `agentd-api` | Hono + dispatcher + gateway |
| Web | `agentd-web` | Next.js dashboard |
| Postgres | StatefulSet or RDS | `TRACE_STORE=postgres`, migrations via Job |
| Inngest | External (recommended) | `DURABLE=inngest` + signing keys |
| E2B | Optional | `RUNTIME=e2b` + `E2B_API_KEY` for isolated sandboxes |

## Quick start (Helm)

1. Build and push images from this repo (`Dockerfile.api`, `Dockerfile.web`).
2. Create secrets (see `infra/helm/agentd/values.yaml`).
3. Install:

```bash
helm upgrade --install agentd ./infra/helm/agentd \
  --namespace agentd --create-namespace \
  --set ingress.host=agentd.yourcorp.com \
  --set postgres.auth.password='CHANGE_ME' \
  --set secrets.data.DATABASE_URL='postgresql://agentd:CHANGE_ME@agentd-agentd-postgres:5432/agentd' \
  --set secrets.data.API_KEY='your-bootstrap-key' \
  --set secrets.data.SECRETS_ENCRYPTION_KEY='32-char-minimum-secret' \
  --set secrets.data.ANTHROPIC_API_KEY='sk-...' \
  --set secrets.data.INNGEST_SIGNING_KEY='...'
```

4. Register Inngest against `https://api.<host>/api/inngest`.
5. Run smoke against the cluster API (or port-forward).

## Docker Compose (single VM)

Same as hosted P6 — see [HOSTING.md](../HOSTING.md):

```bash
cp .env.production.example .env
docker compose up --build
```

Mount all migrations under `packages/db/migrations/` (0000–0006).

## SAML SSO

1. Set IdP metadata (SSO URL + signing cert).
2. Configure API:

```env
AUTH_MODE=saml
SAML_ENABLED=true
SAML_SP_ENTITY_ID=https://api.yourcorp.com
SAML_SP_ACS_URL=https://api.yourcorp.com/v1/auth/saml/acs
SAML_IDP_SSO_URL=https://idp.example.com/sso
SAML_IDP_CERT="-----BEGIN CERTIFICATE-----\n..."
SAML_SESSION_SECRET=long-random-secret
SAML_ORG_ATTRIBUTE=orgId
```

3. SP metadata: `GET /v1/auth/saml/metadata`
4. Login: `GET /v1/auth/saml/login` → IdP → ACS issues `saml_token` redirect to web.
5. Dashboard stores token in `sessionStorage`; API calls use `Authorization: Bearer <token>`.

Map org membership via SAML attribute `orgId` (configurable).

## Audit log export

Owners export append-only runs + events for compliance:

```bash
curl -H "Authorization: Bearer $API_KEY" \
  -H "x-org-id: org_prod" \
  "https://api.yourcorp.com/v1/orgs/org_prod/audit/export?since=2026-01-01T00:00:00Z" \
  -o audit.jsonl
```

Format: NDJSON with `kind: "run"` and `kind: "event"` lines. Secrets are redacted in `run_events` at write time.

## Data residency

See [DATA_RESIDENCY.md](./DATA_RESIDENCY.md).

## Support checklist for pilots

- [ ] Postgres in customer region (or attached disk on K8s node in region)
- [ ] LLM keys stay in gateway (platform process) — not written to traces
- [ ] E2B sandboxes: confirm E2B region / BYOC contract if required
- [ ] Inngest: cloud vs self-hosted event delivery path documented
- [ ] Audit export scheduled to customer SIEM
