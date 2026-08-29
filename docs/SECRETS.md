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

## Cloudflare deployment and read credentials

| Secret | Required by | Description |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | canonical `founder-control-room` deploy and reconcile workflows | Canonical Worker mutation credential with only the permissions required for the `founder-control-room` Worker. Do not reuse it for the review-email Worker, MCP read proof, or read-only Builds inspection. |
| `CLOUDFLARE_REVIEW_EMAIL_DEPLOY_TOKEN` | `review-email-worker-reconcile.yml` | Dedicated mutation credential for `founder-control-room-review-email`. Keep separate from the canonical Worker deploy token. |
| `FCR_CLOUDFLARE_BUILDS_USER_TOKEN` | `cloudflare-build-diagnostic.yml` | Dedicated user-scoped read credential for FCR Workers Builds/provider-authority diagnostics. Keep separate from deploy tokens. The current workflow maps this exact GitHub secret to `CF_API_TOKEN`. |
| `FCR_CLOUDFLARE_MCP_READ_TOKEN` | `cloudflare-mcp-read-diagnostic.yml` | Dedicated least-privilege API token for the official Cloudflare API MCP bearer-auth proof. The standing probe performs only a fixed `GET /accounts/{account_id}` request. Do not grant Edit/Write permissions and do not reuse the deploy token. |
| `FCR_REMOTE_MCP_READ_TOKEN` | temporary `/mcp/read` compatibility lane | Dedicated static bearer used only while existing clients migrate to the canonical Supabase OAuth `/mcp` lane. It grants only the server-held project allowlist and six narrow read/preview tools. Do not reuse a deploy token, provider credential, Supabase service-role key, or founder browser session. Remove this secret after all clients use OAuth. |
| `CLOUDFLARE_ACCOUNT_ID` | deploy and diagnostic workflows | Cloudflare account ID. |
| `CF_SESSIONS_KV_NAMESPACE_ID` | Worker deployment where enabled | KV namespace identifier for sessions. |
| `CF_FEATURE_FLAGS_KV_NAMESPACE_ID` | Worker deployment where enabled | KV namespace identifier for feature flags. |

The authority boundary is **provider + environment + operation class**, not one token per script. Canonical Worker deploy and canonical Worker reconciliation may share the same production mutation credential because they operate on the same authority surface. The review-email Worker, Workers Builds observer, and MCP read witness remain separate because they have different privilege and evidence boundaries.

For the current MCP read witness, create a token scoped to the Founder Control Room account with the minimum account-read permission required for account details. Do not add Access Edit, Workers Scripts Edit/Write, DNS Edit/Write, or other mutation permissions merely to make the probe green. Installing this token into the running Worker is a separate founder-approved runtime activation; the GitHub diagnostic secret does not automatically become a Worker binding.

A documentation name is never allowed to override current executable workflow truth. When a workflow secret name changes, update this registry in the same repair lane or classify the old entry as historical rather than leaving a once-true name presented as current.

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
| `PROOF_OF_SHIP_STEERING_GRANT_ID` | `deploy.yml / proof-of-ship` | Revocable standing-policy identifier that explicitly activates scheduled publication; suggested value: `proof-of-ship-publish-v1`. |

The proof-of-ship Catch Hook is intentionally separate from `ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL`. The deployment workflow fails closed when the dedicated hook or `PROOF_OF_SHIP_STEERING_GRANT_ID` is absent, and it sends a payload only after exact-SHA and Supabase proof pass. Configure the downstream Zap according to `docs/founder-signal-engine/proof-of-ship-publish-contract.md`; do not put the hook URL or grant value in repository code or Cloudflare bindings.

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

---

## Complete workflow secret-name coverage

This table covers GitHub Actions secret names that are referenced outside the canonical deploy registry above. A name appearing here documents wiring only; it does not prove that a value exists, is valid, or has sufficient provider permissions.

| Secret | Referenced by | Requirement / boundary |
|---|---|---|
| `QODO_API_KEY` | `quality-gate.yml` | Optional Qodo workflow-contract integration; the job records missing configuration and keeps required repository gates separate. |
| `SONAR_TOKEN` | `quality-gate.yml` | Optional SonarQube scan credential; scan runs only when both Sonar names are configured. |
| `SONAR_HOST_URL` | `quality-gate.yml` | SonarQube server URL stored in the Actions secret plane because the workflow reads it through `secrets.*`. |
| `NEON_API_KEY` | `neon-pr-branches.yml` | Required for create/delete of PR preview branches when that workflow runs. |
| `OPENAI_API_KEY` | `playwright.yml` | Injected only into the E2E harness when configured; do not expose it to browser/static assets. |
| `PERPLEXITY_API_KEY` | `playwright.yml` | Injected only into the E2E harness when configured; do not expose it to browser/static assets. |
| `N8N_CONVEYOR_WEBHOOK_URL` | `n8n-conveyor-live-probe.yml` | Required private webhook URL for the founder-approved live conveyor probe. |
| `N8N_CONVEYOR_BEARER_TOKEN` | `n8n-conveyor-live-probe.yml` | Required bearer credential paired with the live conveyor webhook probe. |
| `CLOUDFLARE_DEPLOY_HOOK_URL` | `pages-production-release.yml` | Required reusable-workflow secret used to trigger the exact-SHA Pages release. |
| `FCR_CLOUDFLARE_REQUEST_TRACER_TOKEN` | `cloudflare-build-diagnostic.yml` | Optional read credential for request-trace enrichment; does not authorize Worker mutation. |
| `FCR_CLOUDFLARE_DNS_INVENTORY_TOKEN` | `cloudflare-build-diagnostic.yml` | Optional read credential for DNS inventory enrichment; does not authorize DNS mutation. |
| `CLOUDFLARE_ACCESS_API_TOKEN` | `fcr-access-front-door-recovery.yml` | Dedicated read credential for Access inspection. It must not inherit admin mutation authority. |
| `CLOUDFLARE_ACCESS_ADMIN_API_TOKEN` | `fcr-access-front-door-recovery.yml` | Dedicated Access mutation credential used only when the founder-approved `apply=true` recovery path is invoked. |
