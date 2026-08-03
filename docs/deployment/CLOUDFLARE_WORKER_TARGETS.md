# Cloudflare Deployment Targets

## Canonical topology

Founder Control Room uses Cloudflare Pages for the browser frontend and one HTTP Worker for backend execution.

| Cloudflare surface | Domain / role | Repository source | Build / deploy command | Cron |
|---|---|---|---|---|
| Pages project | `foundercontrolroom.org` static frontend | `public/` via `scripts/build-pages.mjs` | Build: `npm run build:pages`; output: `dist-pages` | none |
| `founder-control-room` Worker | `api.foundercontrolroom.org` API, auth, MCP, reconciliation | `wrangler.worker.toml` | Build: `npm run build`; deploy: `npm run deploy` | every minute |
| `founder-control-room-review-email` Worker | private email command intake | `wrangler.email.toml` | dedicated reviewed workflow | none |
| `founder-control-room-deletion-queue` Worker | account-deletion processing | `wrangler.deletion-queue.toml` | dedicated reviewed workflow | every 6 hours |

The former `founder-control-room2` Worker was deleted. Its identity and `wrangler.api.toml` must not be recreated or targeted.

## Pages behavior

The Pages project publishes `dist-pages`, which is a deterministic copy of `public/` containing the landing page, authenticated Control Room application, security headers, and `public/_worker.js`.

The Pages advanced-mode Worker follows this contract:

1. serve an existing `GET` or `HEAD` asset from `env.ASSETS`;
2. forward missing browser routes and all mutation methods to `https://api.foundercontrolroom.org`;
3. preserve path, query, authorization, cookies, and manual redirect handling;
4. stamp the original Pages host in forwarded headers;
5. block proxy loops.

This keeps the existing frontend's relative API requests same-origin while the backend remains isolated on the API custom domain.

### Required Pages dashboard settings

```text
Build command: npm run build:pages
Build output directory: dist-pages
Root directory: repository root / blank
Production branch: main
```

The literal build command `0` is invalid. Do not use it. A no-op command would be `exit 0`, but this repository intentionally uses `npm run build:pages` so required assets and the edge proxy are verified before upload.

## Surviving Worker behavior

`wrangler.worker.toml` is the only HTTP Worker configuration. It must retain:

```text
name: founder-control-room
route: api.foundercontrolroom.org
FOUNDER_API_URL: https://foundercontrolroom.org
FOUNDER_ALLOWED_ORIGINS: https://foundercontrolroom.org
```

`FOUNDER_API_URL` points to the Pages origin intentionally. Supabase magic links return through Pages, Pages proxies `/auth/callback` to the Worker, and the Worker's relative `/control-room/` redirect lands back on the browser frontend.

The Worker owns the reconciliation cron because no duplicate HTTP Worker remains.

## Required Worker secrets

Configure these in the surviving `founder-control-room` Worker secret store and, where named by `.github/workflows/deploy.yml`, in the GitHub `production` environment:

```text
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PUBLISHABLE_KEY
GITHUB_WEBHOOK_SECRET
GITHUB_APP_ID
GITHUB_PRIVATE_KEY
FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON
FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
```

Do not reuse the OpenAI key as the MCP bearer token. The existing OpenAI key reference remains `zapier-founder-signal-engine`.

## Verification gate

A merge does not prove activation. Production is verified only after all of these are captured against one exact main SHA:

1. `npm run build:pages` succeeds and contains `index.html`, `/control-room/`, `_headers`, and `_worker.js`;
2. the Pages production deployment succeeds and `foundercontrolroom.org` renders the landing page;
3. `npm run deploy` uses `wrangler.worker.toml` and reports no remote/local route collision;
4. the Worker deploy reports no missing required secret;
5. `https://api.foundercontrolroom.org/health` returns the expected payload;
6. `https://foundercontrolroom.org/health` returns the same payload through the Pages proxy;
7. authentication returns to `/control-room/` on the Pages origin;
8. the review-only Founder Signal Engine probe returns a correlated receipt and explicit Zapier run ID before any Buffer claim.

## Rollback

- Pages: roll back to the prior successful Pages deployment.
- API Worker: redeploy the prior exact Worker SHA with `wrangler.worker.toml`.
- Proxy: revert `public/_worker.js`; do not point the frontend directly at an unverified origin.
- Credentials: remove or revoke only the affected credential. Do not rotate the OpenAI key to repair Worker binding drift.
- Preserve build logs, deployment IDs, probe receipts, and platform receipts.
