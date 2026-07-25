# GitHub Actions Secrets and Cloudflare Bindings Registry

This repository has two separate configuration planes:

1. **GitHub Actions secrets** used by repository workflows.
2. **Cloudflare Worker runtime bindings** used when `founder-control-room` and `founder-control-room2` initialize.

A value configured in one plane does not automatically exist in the other. Never copy secret values into repository files, PRs, logs, screenshots, or chat.

## GitHub Actions secrets

Set these in **GitHub → Settings → Secrets and variables → Actions → Repository secrets**.

Secrets marked **required** will cause the named workflow job to fail if absent. Secrets marked **continue-on-error** will cause that job to skip gracefully.

---

## Supabase

| Secret | Required by | Description |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `deploy.yml / supabase-migrate` | Supabase CLI personal access token. Used to authenticate `supabase db push`. |
| `SUPABASE_DB_URL` | `deploy.yml / supabase-migrate` | Full Postgres connection string (`postgresql://...`). Direct DB access for migrations. |
| `SUPABASE_SERVICE_ROLE_KEY` | `deploy.yml / worker-deploy`, `reconcile` | Service-role JWT. Never expose client-side. Used by the Worker and the self-reconcile script. |
| `NEXT_PUBLIC_SUPABASE_URL` | `deploy.yml / worker-deploy` | Public Supabase project URL (`https://<ref>.supabase.co`). Safe to expose. This workflow variable does not replace the Worker runtime binding named `SUPABASE_URL`. |

---

## Cloudflare deployment credentials

| Secret | Required by | Description |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `deploy.yml / worker-deploy` | Wrangler deploy token. Scope: `Workers Scripts:Edit` on the target account. |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy.yml / worker-deploy` | Cloudflare account ID. |
| `CF_SESSIONS_KV_NAMESPACE_ID` | `deploy.yml / worker-deploy` | KV namespace ID for session storage. |
| `CF_FEATURE_FLAGS_KV_NAMESPACE_ID` | `deploy.yml / worker-deploy` | KV namespace ID for feature flags. |

---

## Cloudflare Worker runtime bindings

Configure these separately for **both** Workers:

- `founder-control-room`
- `founder-control-room2`

Use the Cloudflare dashboard or an approved scoped provider tool. Secret values must use Cloudflare's encrypted secret storage where applicable.

| Binding | Type | Requirement |
|---|---|---|
| `SUPABASE_URL` | non-secret variable | Required absolute URL for the Control Room Supabase project. |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Required server-only service-role credential. |
| `SUPABASE_PUBLISHABLE_KEY` | secret or protected variable | Required publishable Supabase key used by the server runtime. |
| `GITHUB_WEBHOOK_SECRET` | secret | Required webhook verification secret. |
| `GITHUB_APP_ID` | protected variable | Preferred GitHub authentication path; must be paired with `GITHUB_PRIVATE_KEY`. |
| `GITHUB_PRIVATE_KEY` | secret | Preferred GitHub authentication path; must be paired with `GITHUB_APP_ID`. |
| `GITHUB_TOKEN` | secret | Development/fallback GitHub authentication. Required only when the GitHub App pair is absent. |
| `FOUNDER_ALLOWED_ORIGINS` | non-secret variable | Required comma-separated absolute origins. |
| `FOUNDER_API_URL` | non-secret variable | Required absolute Founder Control Room API URL. |
| `REPOSITORY_INGEST_SECRET` | secret | Optional. Without it, repository-verification ingest remains unauthorized. |

The Worker intentionally fails closed when required bindings are absent, empty, malformed, or when neither supported GitHub authentication path is complete. Do not weaken `validateWorkerEnv` to bypass provider configuration.

After binding configuration, capture separate evidence for each Worker:

1. Cloudflare build/deployment ID;
2. successful deployment conclusion;
3. binding-name read-back without exposing values;
4. `/health` or equivalent runtime response;
5. MCP or API discovery proof when applicable.

---

## Deploy

| Secret | Required by | Description |
|---|---|---|
| `DEPLOY_URL` | `deploy.yml / smoke-test`, `reconcile` | Base URL of the deployed app, with no trailing slash. Used for health checks and reconciliation pings. |

---

## Reconciliation

| Secret | Required by | Description |
|---|---|---|
| `RECONCILE_SHARED_SECRET` | `deploy.yml / reconcile`, `POST /api/reconcile` | A strong random token of at least 32 characters shared between the deploy workflow and the `/api/reconcile` endpoint. The endpoint validates `X-Reconcile-Secret` on every inbound DriftReport. Set identically in the Control Room environment and in each peer service that pushes reports. |

### Generating `RECONCILE_SHARED_SECRET`

```bash
# macOS / Linux
openssl rand -hex 32

# Node
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output into:

1. GitHub repository secrets for Founder Control Room;
2. Se'kret Bip's corresponding secret store;
3. `l99-StoryEngine`'s corresponding secret store.

Never commit this value. Never log it. Never put it in a `NEXT_PUBLIC_*` variable.

---

## Full configuration checklist

### GitHub Actions

```text
[ ] SUPABASE_ACCESS_TOKEN
[ ] SUPABASE_DB_URL
[ ] SUPABASE_SERVICE_ROLE_KEY
[ ] NEXT_PUBLIC_SUPABASE_URL
[ ] CLOUDFLARE_API_TOKEN
[ ] CLOUDFLARE_ACCOUNT_ID
[ ] CF_SESSIONS_KV_NAMESPACE_ID
[ ] CF_FEATURE_FLAGS_KV_NAMESPACE_ID
[ ] DEPLOY_URL
[ ] RECONCILE_SHARED_SECRET
```

### Each Cloudflare Worker

```text
[ ] SUPABASE_URL
[ ] SUPABASE_SERVICE_ROLE_KEY
[ ] SUPABASE_PUBLISHABLE_KEY
[ ] GITHUB_WEBHOOK_SECRET
[ ] GITHUB_APP_ID + GITHUB_PRIVATE_KEY
    OR
[ ] GITHUB_TOKEN
[ ] FOUNDER_ALLOWED_ORIGINS
[ ] FOUNDER_API_URL
[ ] REPOSITORY_INGEST_SECRET (optional)
```
