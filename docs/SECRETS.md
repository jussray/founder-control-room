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
| `APP_ID` | `deterministic-review-core-advisory.yml` trusted witness publication, `github-app-secret-shape-diagnostic.yml` read-only production shape diagnostic, and FCR governance reconciliation | Numeric GitHub App ID for the repository-scoped Founder Control Room App. Mapped at job runtime to `GITHUB_APP_ID`. |
| `APP_PRIVATE_KEY` | `deterministic-review-core-advisory.yml` trusted witness publication, `github-app-secret-shape-diagnostic.yml` read-only production shape diagnostic, and FCR governance reconciliation | Complete PEM private key for the same GitHub App. Mapped at job runtime to `GITHUB_PRIVATE_KEY`. Never log or expose the value. |

`APP_ID` and `APP_PRIVATE_KEY` must identify the same installed App. The read-only `github-app-secret-shape-diagnostic.yml` proves only local credential transport/PEM/RSA shape and explicitly performs no provider authentication or issuer readback. For workflows that claim provider proof, success must separately establish that both mapped runtime values were usable and that provider readback reports the expected App issuer; secret-name presence or a green shape diagnostic alone is not provider proof.

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
