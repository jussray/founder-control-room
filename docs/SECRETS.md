# GitHub Actions Secrets and Cloudflare Bindings Registry

This repository has three separate configuration planes:

1. **Cloudflare Pages build settings** for the static frontend.
2. **GitHub Actions secrets** used by repository workflows.
3. **Cloudflare Worker runtime bindings** used by the surviving `founder-control-room` API Worker.

A value configured in one plane does not automatically exist in another. Never copy secret values into repository files, PRs, logs, screenshots, or chat.

## Cloudflare Pages

Pages serves the browser frontend at `foundercontrolroom.org` and requires no application secrets.

```text
Build command: npm run build:pages
Build output directory: dist-pages
Production branch: main
```

The output includes `public/_worker.js`, which forwards missing routes and browser mutations to `https://api.foundercontrolroom.org`. Do not place provider credentials in Pages variables or static assets.

## GitHub Actions secrets

Set these in **GitHub → Settings → Secrets and variables → Actions**, using the `production` environment where required by `deploy.yml`.

Secrets marked required cause the named workflow job to fail if absent.

---

## Supabase

| Secret | Required by | Description |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase administration workflows | Supabase CLI personal access token where a workflow explicitly requires it. |
| `SUPABASE_DB_URL` | `deploy.yml / supabase-migrate` | Full Postgres connection string used by `supabase db push`. |
| `SUPABASE_SERVICE_ROLE_KEY` | `deploy.yml / worker-deploy`, `reconcile` | Service-role JWT. Never expose client-side. |
| `SUPABASE_PUBLISHABLE_KEY` | `deploy.yml / worker-deploy` | Publishable Supabase key used by server-side auth runtime. |
| `NEXT_PUBLIC_SUPABASE_URL` | deploy and reconciliation workflows | Public Supabase project URL. This does not replace the Worker binding named `SUPABASE_URL`. |

---

## Cloudflare deployment credentials

| Secret | Required by | Description |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `deploy.yml / worker-deploy` | Wrangler deploy token with `Workers Scripts:Edit` on the target account. |
| `CLOUDFLARE_BUILDS_API_TOKEN` | manual build diagnostics | User-scoped read credential for Cloudflare Builds diagnostics. Keep separate from deploy tokens. |
| `CLOUDFLARE_ACCOUNT_ID` | deploy and diagnostic workflows | Cloudflare account ID. |
| `CF_SESSIONS_KV_NAMESPACE_ID` | Worker deployment where enabled | KV namespace identifier for sessions. |
| `CF_FEATURE_FLAGS_KV_NAMESPACE_ID` | Worker deployment where enabled | KV namespace identifier for feature flags. |

---

## Surviving Cloudflare Worker runtime bindings

Configure these only for the existing **`founder-control-room` Worker**, which serves `api.foundercontrolroom.org` through `wrangler.worker.toml`.

The former `founder-control-room2` Worker was deleted and must not be recreated merely to match historical repository configuration.

| Binding | Type | Requirement |
|---|---|---|
| `SUPABASE_URL` | non-secret variable | Required absolute URL for the Founder Control Room Supabase project. |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Required server-only service-role credential. |
| `SUPABASE_PUBLISHABLE_KEY` | secret or protected variable | Required publishable Supabase key used by server auth. |
| `GITHUB_WEBHOOK_SECRET` | secret | Required webhook verification secret. |
| `GITHUB_APP_ID` | protected variable | Preferred GitHub authentication path; paired with `GITHUB_PRIVATE_KEY`. |
| `GITHUB_PRIVATE_KEY` | secret | Preferred GitHub authentication path; paired with `GITHUB_APP_ID`. |
| `GITHUB_TOKEN` | secret | Local/development fallback only when the GitHub App pair is absent. |
| `FOUNDER_ALLOWED_ORIGINS` | non-secret variable | `https://foundercontrolroom.org`. |
| `FOUNDER_API_URL` | non-secret variable | `https://foundercontrolroom.org` so auth callbacks return through Pages and are proxied to the API Worker. |
| `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON` | secret | Scoped, revocable, fail-closed automation grant. |
| `FOUNDER_SIGNAL_ENGINE_MCP_TOKEN` | secret | Dedicated MCP bearer token. This is not an OpenAI API key. |
| `ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL` | secret | Private approved Zapier Catch Hook URL. |
| `FOUNDER_SIGNAL_ENGINE_HOOK_TIMEOUT_MS` | protected variable | Optional bounded provider timeout. |
| `FOUNDER_REVIEW_EMAIL_INGRESS_SECRET` | secret | Shared only with the review-email Worker when that route is activated. |
| `REPOSITORY_INGEST_SECRET` | secret | Optional repository-verification ingest credential. |

The Worker intentionally fails closed when required bindings are absent, empty, malformed, or when the GitHub App pair is incomplete. Do not weaken `validateWorkerEnv` to bypass provider configuration.

The existing provider-held OpenAI key reference remains:

```text
zapier-founder-signal-engine
```

Do not reuse it as `FOUNDER_SIGNAL_ENGINE_MCP_TOKEN`, and do not rotate or recreate it to repair a Cloudflare binding problem.

After configuration, capture:

1. exact source SHA;
2. successful Worker deployment ID and conclusion;
3. binding-name read-back without values;
4. direct API `/health` response;
5. Pages-proxied `/health` response;
6. MCP probe receipt and explicit Zapier run ID when the bridge is tested.

---

## Deploy

| Secret | Required by | Description |
|---|---|---|
| `DEPLOY_URL` | `deploy.yml / smoke-test` | Set to `https://api.foundercontrolroom.org` with no trailing slash. |
| `FOUNDER_SIGNAL_ENGINE_MCP_TOKEN` | authority gate and Worker deploy | Must match the encrypted value installed in the surviving Worker. |
| `ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL` | authority gate and Worker deploy | Must match the approved private provider hook installed in the Worker. |
| `ZAPIER_CATCH_HOOK_URL` | `deploy.yml / proof-of-ship` | Dedicated Catch Hook for verified allowlisted release payloads; do not reuse the Worker bridge hook. |

The proof-of-ship Catch Hook is intentionally separate from `ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL`. The deployment workflow fails closed when the dedicated hook is absent, and it sends a payload only after exact-SHA and Supabase proof pass. Configure the downstream Zap according to `docs/founder-signal-engine/proof-of-ship-publish-contract.md`; do not put the hook URL in repository code or Cloudflare bindings.

---

## Reconciliation

| Secret | Required by | Description |
|---|---|---|
| `RECONCILE_SHARED_SECRET` | reconciliation endpoints and peer services | Strong random token of at least 32 characters shared only with approved peers. |

### Generating `RECONCILE_SHARED_SECRET`

```bash
openssl rand -hex 32

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit, log, or expose this value through a `NEXT_PUBLIC_*` variable.

---

## Full configuration checklist

### Cloudflare Pages

```text
[ ] Build command = npm run build:pages
[ ] Build output directory = dist-pages
[ ] Production branch = main
[ ] foundercontrolroom.org custom domain points to the Pages project
```

### GitHub production environment

```text
[ ] SUPABASE_DB_URL
[ ] SUPABASE_SERVICE_ROLE_KEY
[ ] SUPABASE_PUBLISHABLE_KEY
[ ] NEXT_PUBLIC_SUPABASE_URL
[ ] GITHUB_WEBHOOK_SECRET
[ ] GITHUB_APP_ID
[ ] GITHUB_PRIVATE_KEY
[ ] CLOUDFLARE_API_TOKEN
[ ] CLOUDFLARE_ACCOUNT_ID
[ ] DEPLOY_URL=https://api.foundercontrolroom.org
[ ] FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
[ ] ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
[ ] ZAPIER_CATCH_HOOK_URL for scheduled proof-of-ship publication
[ ] RECONCILE_SHARED_SECRET where enabled
```

### `founder-control-room` Worker

```text
[ ] SUPABASE_URL
[ ] SUPABASE_SERVICE_ROLE_KEY
[ ] SUPABASE_PUBLISHABLE_KEY
[ ] GITHUB_WEBHOOK_SECRET
[ ] GITHUB_APP_ID + GITHUB_PRIVATE_KEY
[ ] FOUNDER_ALLOWED_ORIGINS=https://foundercontrolroom.org
[ ] FOUNDER_API_URL=https://foundercontrolroom.org
[ ] FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON
[ ] FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
[ ] ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
[ ] FOUNDER_REVIEW_EMAIL_INGRESS_SECRET when email intake is active
[ ] REPOSITORY_INGEST_SECRET when repository ingest is active
```
