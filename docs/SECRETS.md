# GitHub Actions Secrets Registry

Every secret required by `.github/workflows/` is listed here.
Set these in **GitHub → Settings → Secrets and variables → Actions → Repository secrets**.

Secrets marked **required** will cause the named workflow job to fail if absent.
Secrets marked **continue-on-error** will cause that job to skip gracefully.

---

## Supabase

| Secret | Required by | Description |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `deploy.yml / supabase-migrate` | Supabase CLI personal access token. Used to authenticate `supabase db push`. |
| `SUPABASE_DB_URL` | `deploy.yml / supabase-migrate` | Full Postgres connection string (`postgresql://...`). Direct DB access for migrations. |
| `SUPABASE_SERVICE_ROLE_KEY` | `deploy.yml / worker-deploy`, `reconcile` | Service-role JWT. Never expose client-side. Used by the Worker and the self-reconcile script. |
| `NEXT_PUBLIC_SUPABASE_URL` | `deploy.yml / worker-deploy` | Public Supabase project URL (`https://<ref>.supabase.co`). Safe to expose. |

---

## Cloudflare

| Secret | Required by | Description |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `deploy.yml / worker-deploy` | Wrangler deploy token. Scope: `Workers Scripts:Edit` on the target account. |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy.yml / worker-deploy` | Cloudflare account ID (found in the dashboard sidebar). |
| `CF_SESSIONS_KV_NAMESPACE_ID` | `deploy.yml / worker-deploy` | KV namespace ID for session storage. |
| `CF_FEATURE_FLAGS_KV_NAMESPACE_ID` | `deploy.yml / worker-deploy` | KV namespace ID for feature flags. |

---

## Deploy

| Secret | Required by | Description |
|---|---|---|
| `DEPLOY_URL` | `deploy.yml / smoke-test`, `reconcile` | Base URL of the deployed app (e.g. `https://founder-control-room.example.com`). No trailing slash. Used for health checks and reconciliation pings. |

---

## Reconciliation

| Secret | Required by | Description |
|---|---|---|
| `RECONCILE_SHARED_SECRET` | `deploy.yml / reconcile`, `POST /api/reconcile` | A strong random token (≥ 32 chars) shared between the deploy workflow and the `/api/reconcile` endpoint. The endpoint validates `X-Reconcile-Secret: <value>` on every inbound DriftReport. **Required** for the self-reconcile script and the Sekret-Bip / L99 probes. Set identically in the Control Room environment and in each peer service that pushes reports. |

### Generating RECONCILE_SHARED_SECRET

```bash
# macOS / Linux
openssl rand -hex 32

# Node
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output into:
1. **GitHub** → Settings → Secrets → `RECONCILE_SHARED_SECRET`
2. **Sekret-Bip** → same secret name (used when it POSTs drift reports)
3. **l99-StoryEngine** → same secret name

> ⚠️ Never commit this value. Never log it. Never put it in `NEXT_PUBLIC_*` vars.

---

## Full secrets checklist

Run this before triggering deploy for the first time:

```
[ ] SUPABASE_ACCESS_TOKEN
[ ] SUPABASE_DB_URL
[ ] SUPABASE_SERVICE_ROLE_KEY
[ ] NEXT_PUBLIC_SUPABASE_URL
[ ] CLOUDFLARE_API_TOKEN
[ ] CLOUDFLARE_ACCOUNT_ID
[ ] CF_SESSIONS_KV_NAMESPACE_ID
[ ] CF_FEATURE_FLAGS_KV_NAMESPACE_ID
[ ] DEPLOY_URL
[ ] RECONCILE_SHARED_SECRET          ← added this session
```
