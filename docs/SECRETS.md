# GitHub Actions Secrets and Cloudflare Bindings Registry

This repository has three separate configuration planes:

1. **Cloudflare Pages build settings** for the static frontend.
2. **GitHub Actions secrets** used by repository workflows.
3. **Cloudflare Worker runtime bindings** used by the surviving `founder-control-room` API Worker.

A value configured in one plane does not automatically exist in another. Never copy secret values into repository files, PRs, logs, screenshots, or chat.

Cloudflare dashboard token **display names are operator labels, not execution bindings**. A label such as `founder-control-room build token` does not prove which GitHub secret or workflow consumes that credential. For operational truth, use the exact GitHub secret name referenced by the current workflow plus a successful provider verification/readback receipt. If either is missing, the binding is unknown.

## Cloudflare Pages

Pages serves the browser frontend at `foundercontrolroom.org` and requires no application secrets.

```text
Build command: npm run build:pages
Build output directory: dist-pages
Production branch: main
```

The output includes `public/_worker.js`, which forwards missing routes and browser mutations to `https://api.foundercontrolroom.org`. Do not place provider credentials in Pages variables or static assets.

## GitHub Actions secrets

Set these in **GitHub → Settings → Secrets and variables → Actions**, using the `production` environment where required by the workflow.

Secrets marked required cause the named workflow job to fail if absent.

GitHub Actions secret names must not use the reserved `GITHUB_` prefix. The trusted GitHub App workflows therefore store the App credentials as `APP_ID` and `APP_PRIVATE_KEY`, then map them into the server/runtime environment names `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` inside the job. Those internal environment names remain the provider contract and are intentionally unchanged.

The GitHub App **Client ID is not used** by the current installation-token witness or governance-reconciliation path. Keeping a separately stored Client ID is harmless, but it is not a substitute for the numeric App ID or the App private-key PEM and should not be treated as proof that the trusted App path is configured.

### GitHub App authority

| Secret | Required by | Description |
|---|---|---|
| `APP_ID` | trusted witness publication, read-only production shape diagnostic, and FCR governance reconciliation | Numeric GitHub App ID for the repository-scoped Founder Control Room App. Mapped at job runtime to `GITHUB_APP_ID`. |
| `APP_PRIVATE_KEY` | trusted witness publication, read-only production shape diagnostic, and FCR governance reconciliation | Complete PEM private key for the same GitHub App. Mapped at job runtime to `GITHUB_PRIVATE_KEY`. Never log or expose the value. |

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

## Cloudflare deployment and read credentials

| Secret | Required by | Description |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | canonical `founder-control-room` deploy and reconcile workflows | Canonical Worker mutation credential with only the permissions required for the `founder-control-room` Worker. |
| `CLOUDFLARE_REVIEW_EMAIL_DEPLOY_TOKEN` | `review-email-worker-reconcile.yml` | Dedicated mutation credential for `founder-control-room-review-email`. |
| `FCR_CLOUDFLARE_BUILDS_USER_TOKEN` | `cloudflare-build-diagnostic.yml` | Dedicated user-scoped read credential for FCR Workers Builds/provider-authority diagnostics. |
| `FCR_CLOUDFLARE_MCP_READ_TOKEN` | `cloudflare-mcp-read-diagnostic.yml` | Dedicated least-privilege API token for the official Cloudflare API MCP bearer-auth proof. |
| `FCR_REMOTE_MCP_READ_TOKEN` | temporary `/mcp/read` compatibility lane | Dedicated static bearer used only while existing clients migrate to the canonical Supabase OAuth `/mcp` lane. |
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
| `FOUNDER_SESSION_ENCRYPTION_KEY` | secret | Required 32-byte base64url key used only by the API Worker to encrypt Supabase credentials stored behind the opaque HttpOnly founder session. |
| `GITHUB_WEBHOOK_SECRET` | secret | Required webhook verification secret. |
| `GITHUB_APP_ID` | protected variable | Preferred GitHub authentication path; paired with `GITHUB_PRIVATE_KEY`. |
| `GITHUB_PRIVATE_KEY` | secret | Preferred GitHub authentication path; paired with `GITHUB_APP_ID`. |
| `GITHUB_TOKEN` | secret | Local/development fallback only when the GitHub App pair is absent. |
| `FOUNDER_ALLOWED_ORIGINS` | non-secret variable | `https://foundercontrolroom.org`. |
| `FOUNDER_API_URL` | non-secret variable | `https://foundercontrolroom.org` so auth callbacks return through Pages and are proxied to the API Worker. |
| `FCR_SHOPIFY_WEBHOOK_SECRET` | secret | Required Shopify `orders/paid` HMAC signing secret for the FCR first-party commerce ingress. Provider-held; never log or copy its value into proof. |
| `FCR_WHOP_WEBHOOK_SECRET` | secret | Required Whop Standard Webhooks signing secret for `POST /webhooks/whop/fcr/payments-succeeded`. Provider-held in the canonical Worker secret store; source declaration does not prove Whop webhook registration, secret installation, or a signed delivery. |
| `FCR_COMMERCE_HASH_SALT` | secret | Required independent server-only salt for privacy-safe commerce reference HMACs. This marker creates no provider authority. |
| `TINYFISH_API_KEY` | secret | Required provider-held credential for live `tinyfish-web-observation-v1` Search/Fetch. |
| `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON` | secret | Scoped, revocable, fail-closed automation grant. |
| `FOUNDER_SIGNAL_ENGINE_MCP_TOKEN` | secret | Dedicated MCP bearer token. This is not an OpenAI API key. |
| `ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL` | secret | Private approved Zapier Catch Hook URL. |
| `FOUNDER_SIGNAL_ENGINE_HOOK_TIMEOUT_MS` | protected variable | Optional bounded provider timeout. |
| `FOUNDER_REVIEW_EMAIL_INGRESS_SECRET` | secret | Shared only with the review-email Worker when that route is activated. |
| `N8N_FOUNDER_CONTENT_WEBHOOK_URL` | secret | Required private production webhook URL for the governed Founder Content n8n workflow. |
| `N8N_FOUNDER_CONTENT_BEARER_TOKEN` | secret | Bearer credential paired only with the governed Founder Content production webhook. |
| `N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_FINGERPRINT` | secret | Exact SHA-256 workflow fingerprint that binds FCR to the published n8n workflow identity. |
| `N8N_FOUNDER_CONTENT_IDENTITY_HMAC_SECRET` | secret | HMAC secret used to verify challenge-bound n8n runtime identity receipts. |
| `REPOSITORY_INGEST_SECRET` | secret | Optional repository-verification ingest credential. |

The Worker intentionally fails closed when required bindings are absent, empty, malformed, or when the GitHub App pair is incomplete. Do not weaken `validateWorkerEnv` to bypass provider configuration.

For the Whop lane, checked-in route wiring and the `FCR_WHOP_WEBHOOK_SECRET` name prove source intent only. Production truth additionally requires provider-side webhook registration, Worker binding-name readback without exposing the value, the provider-neutral commerce migration, and a valid signed delivery/readback. Checkout or revenue claims require their own runtime/outcome evidence.

---

## Deploy

| Secret | Required by | Description |
|---|---|---|
| `DEPLOY_URL` | `deploy.yml / smoke-test` | Set to `https://api.foundercontrolroom.org` with no trailing slash. |
| `FOUNDER_SESSION_ENCRYPTION_KEY` | `deploy.yml / authority-gate`, `deploy.yml / worker-deploy` | Required GitHub `production` secret. |
| `FOUNDER_SIGNAL_ENGINE_MCP_TOKEN` | authority gate and Worker deploy | Must match the encrypted value installed in the surviving Worker. |
| `ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL` | authority gate and Worker deploy | Must match the approved private provider hook installed in the Worker. |
| `ZAPIER_CATCH_HOOK_URL` | `deploy.yml / proof-of-ship` | Dedicated Catch Hook for verified allowlisted release payloads. |
| `PROOF_OF_SHIP_STEERING_GRANT_ID` | `deploy.yml / proof-of-ship` | Revocable standing-policy identifier that explicitly activates scheduled publication. |

---

## Reconciliation

| Secret | Required by | Description |
|---|---|---|
| `RECONCILE_SHARED_SECRET` | reconciliation endpoints and peer services | Strong random token of at least 32 characters shared only with approved peers. |

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
[ ] FOUNDER_SESSION_ENCRYPTION_KEY (32 random bytes, unpadded base64url; supplied to Worker deploy)
[ ] NEXT_PUBLIC_SUPABASE_URL
[ ] GITHUB_WEBHOOK_SECRET
[ ] APP_ID (numeric Founder Control Room GitHub App ID)
[ ] APP_PRIVATE_KEY (matching GitHub App private-key PEM)
[ ] CLOUDFLARE_API_TOKEN for canonical founder-control-room mutation only
[ ] CLOUDFLARE_REVIEW_EMAIL_DEPLOY_TOKEN for founder-control-room-review-email only
[ ] FCR_CLOUDFLARE_BUILDS_USER_TOKEN for read-only FCR Workers Builds inspection
[ ] FCR_CLOUDFLARE_MCP_READ_TOKEN for official Cloudflare API MCP GET-only provider proof
[ ] CLOUDFLARE_ACCOUNT_ID
[ ] DEPLOY_URL=https://api.foundercontrolroom.org
[ ] FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
[ ] ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
[ ] ZAPIER_CATCH_HOOK_URL for scheduled proof-of-ship publication
[ ] PROOF_OF_SHIP_STEERING_GRANT_ID for scheduled proof-of-ship publication
[ ] RECONCILE_SHARED_SECRET where enabled
```

### `founder-control-room` Worker

```text
[ ] SUPABASE_URL
[ ] SUPABASE_SERVICE_ROLE_KEY
[ ] SUPABASE_PUBLISHABLE_KEY
[ ] FOUNDER_SESSION_ENCRYPTION_KEY (32 random bytes, unpadded base64url)
[ ] GITHUB_WEBHOOK_SECRET
[ ] GITHUB_APP_ID + GITHUB_PRIVATE_KEY
[ ] FOUNDER_ALLOWED_ORIGINS=https://foundercontrolroom.org
[ ] FOUNDER_API_URL=https://foundercontrolroom.org
[ ] FCR_SHOPIFY_WEBHOOK_SECRET (provider-held Shopify HMAC secret)
[ ] FCR_WHOP_WEBHOOK_SECRET (provider-held Whop Standard Webhooks signing secret)
[ ] FCR_COMMERCE_HASH_SALT (independent server-only commerce-reference HMAC salt)
[ ] TINYFISH_API_KEY (provider-held; required before live TinyFish activation)
[ ] FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON
[ ] FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
[ ] ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
[ ] FOUNDER_REVIEW_EMAIL_INGRESS_SECRET when email intake is active
[ ] N8N_FOUNDER_CONTENT_WEBHOOK_URL
[ ] N8N_FOUNDER_CONTENT_BEARER_TOKEN
[ ] N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_FINGERPRINT
[ ] N8N_FOUNDER_CONTENT_IDENTITY_HMAC_SECRET
[ ] REPOSITORY_INGEST_SECRET when repository ingest is active
```

---

## Complete workflow secret-name coverage

This section records additional workflow-side secret names. A documented name proves wiring only, never provider validity or runtime presence.

| Secret | Referenced by | Requirement / boundary |
|---|---|---|
| `QODO_API_KEY` | `quality-gate.yml` | Optional Qodo workflow-contract integration. |
| `SONAR_TOKEN` | `quality-gate.yml` | Optional SonarQube scan credential. |
| `SONAR_HOST_URL` | `quality-gate.yml` | SonarQube server URL. |
| `NEON_API_KEY` | `neon-pr-branches.yml` | Required for PR preview branches when that workflow runs. |
| `OPENAI_API_KEY` | `playwright.yml` | Injected only into the E2E harness when configured; never expose to browser/static assets. |
| `PERPLEXITY_API_KEY` | `playwright.yml` | Injected only into the E2E harness when configured; never expose to browser/static assets. |
| `FCR_PLAYWRIGHT_FOUNDER_BEARER` | runtime proof workflows | Founder bearer credential used only for authorized deployed-runtime proof. |
| `N8N_CONVEYOR_WEBHOOK_URL` | n8n live probe | Private webhook URL for the approved live conveyor probe. |
| `N8N_CONVEYOR_BEARER_TOKEN` | n8n live probe | Bearer credential paired with the live conveyor webhook probe. |
| `CLOUDFLARE_DEPLOY_HOOK_URL` | Pages production release | Required reusable-workflow secret for exact-SHA Pages release. |
| `ANTHROPIC_API_KEY` | AI failure repair | Required for the serialized Claude repair pass under the workflow authority block. |

### `MODEL_API_KEY`

- Required by the canonical Founder Control Room Cloudflare Worker for the bounded Muse provider adapter.
- Store the value only as a provider-held Cloudflare Worker secret; never commit, print, echo, attach, or include it in proof artifacts.
- Source declaration or documentation proves the required secret name only. Live presence requires a successful provider-side secret-name readback, and successful Council/Muse operation requires a separate authenticated runtime receipt.
