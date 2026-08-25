# Cloudflare Deployment Targets

## Canonical topology

Founder Control Room uses Cloudflare Pages for the browser frontend and one canonical HTTP Worker for backend execution.

| Cloudflare surface | Domain / role | Repository source | Build / deploy command | Cron |
|---|---|---|---|---|
| Pages project | `foundercontrolroom.org` static frontend + same-origin edge proxy | `public/` via `scripts/build-pages.mjs` | Build: `npm run build:pages`; output: `dist-pages` | none |
| `founder-control-room` Worker | `api.foundercontrolroom.org` API, auth, MCP, reconciliation | `wrangler.worker.toml` | Build authority hook: `node scripts/verify-worker-build-authority.mjs`; production deploy: guarded GitHub workflow | every minute |
| `founder-control-room-review-email` Worker | private email command intake | `wrangler.email.toml` | dedicated reviewed workflow | none |
| `founder-control-room-deletion-queue` Worker | account-deletion processing | `wrangler.deletion-queue.toml` | dedicated reviewed workflow | every 6 hours |

The former `founder-control-room2` Worker was retired. Its identity and `wrangler.api.toml` must not be recreated or targeted without a new explicit authority decision.

## Pages behavior

The Pages project publishes `dist-pages`, a deterministic copy of `public/` containing the landing page, authenticated Control Room application, security headers, and `public/_worker.js`.

Current merged source uses this contract:

1. serve existing static `GET` / `HEAD` assets from `env.ASSETS`;
2. route dynamic/mutation requests through the Pages Service Binding `env.FCR_API`;
3. preserve path, query, authorization, cookies, and manual redirect handling;
4. stamp the original Pages host in forwarded headers;
5. block proxy loops;
6. require the upstream response to identify the canonical API service as `founder-control-room`; and
7. fail closed with a bounded 503 recovery response when the service binding is absent, unreachable, returns Cloudflare upstream failure status, or fails service identity verification.

`API_ORIGIN = https://api.foundercontrolroom.org` remains part of request construction/loop protection in source. Dynamic network execution is performed through `FCR_API.fetch(...)`, not a direct public-origin `fetch()` call.

### Required Pages provider configuration

Repository source now **depends on** a Pages Service Binding named:

```text
FCR_API
```

Its intended target is the canonical Worker:

```text
founder-control-room
```

That intended binding is a deployment/provider requirement, not a claim that the current Cloudflare Pages project is configured correctly. Before calling the Pages/API path live, require authoritative Cloudflare readback or deployed-path evidence proving the binding exists and resolves to the intended service.

Required Pages build settings remain:

```text
Build command: npm run build:pages
Build output directory: dist-pages
Root directory: repository root / blank
Production branch: main
```

The literal build command `0` is invalid. This repository intentionally uses `npm run build:pages` so required assets and edge-proxy contracts are verified before upload.

## Canonical Worker behavior

`wrangler.worker.toml` is the canonical HTTP Worker configuration. It must retain the intended identity/routing relationship for:

```text
name: founder-control-room
route: api.foundercontrolroom.org
FOUNDER_API_URL: https://foundercontrolroom.org
FOUNDER_ALLOWED_ORIGINS: https://foundercontrolroom.org
```

`FOUNDER_API_URL` points to the Pages origin intentionally. Supabase magic links return through Pages, Pages routes dynamic requests to the API Worker, and the Worker's relative `/control-room/` redirect lands back on the browser frontend.

The canonical Worker owns the reconciliation cron because no duplicate HTTP Worker should exist.

### Remote read MCP operator boundary

The canonical Worker also owns the served remote read-only MCP endpoint at:

```text
POST https://api.foundercontrolroom.org/mcp/read
```

Repository configuration binds `FCR_REMOTE_MCP_READ_PROJECTS` to exactly `chief-ai-machine,founder-control-room` and requires the dedicated secret name `FCR_REMOTE_MCP_READ_TOKEN`. The scope is server-held; an MCP caller cannot widen it by supplying another project identifier or by reusing another FCR credential.

The secret value belongs only in the canonical Worker secret store. Never place it in Wrangler source, `.env.example`, GitHub issues, PR bodies, screenshots, logs, browser code, or proof artifacts. Repository source proves the intended secret interface and project scope only; it does not prove that the secret is installed, the deployed runtime matches this source, or the live endpoint is reachable.

The route must fail closed if the token or project scope is unavailable. Its advertised surface remains limited to `list_read_servers` and `invoke_read_tool`, and the underlying FCR MCP registry/policy remains authoritative for provider/tool reads. Expanding the scope beyond Chief AI + Founder Control Room requires a separate reviewed authority change.

### Worker build authority invariant

The canonical Worker configuration owns a custom Wrangler `[build]` hook:

```text
node scripts/verify-worker-build-authority.mjs
```

That hook makes the repository's production-authority boundary executable before Wrangler can promote a Worker build:

- native Cloudflare Workers Builds must report an exact `WORKERS_CI_COMMIT_SHA` that equals the checked-out Git HEAD;
- native builds must retain branch and build UUID evidence;
- native Workers Builds may run only the non-promoting `wrangler versions upload` lane;
- native `wrangler deploy` fails closed before production promotion;
- GitHub production promotion is recognized only in the manual `Deploy` or `FCR Worker Reconcile` workflow-dispatch contexts when GitHub's exact workflow SHA equals the checked-out source SHA; and
- ordinary CI/local verification does not become production authority.

The hook emits a redacted `fcr/worker-build-authority-receipt@v1`. That receipt proves only the source/build authority decision it records. It cannot mutate Cloudflare, prove provider dashboard configuration, prove the active deployment, or replace `/health`, `/version`, Pages binding, and Playwright runtime evidence.

### Outbound email boundary

The canonical Worker owns the FCR outbound Cloudflare Email Service capability through the project-scoped binding `FCR_EMAIL`. Repository source pins the only allowed FCR sender identity to `welcome@api.foundercontrolroom.org` in both `src/worker/projectEmail.ts` and `wrangler.worker.toml`; application callers may provide recipients/content but not a different `from` identity. A generic `EMAIL` binding or another project's sender must not be substituted into this Worker without a separate reviewed authority change.

This checked-in binding and sender allowlist prove repository intent only. They do not prove the sender domain is onboarded at Cloudflare, the live Worker currently has the binding, or any message was accepted or delivered. Those remain provider/runtime evidence gates.

## Cloudflare Access recovery boundary

Repository source contains a founder-gated Cloudflare Access inspection/recovery lane. Its existence does **not** prove current Access application state, exemption state, token permissions, or production front-door availability.

Keep these truths separate:

```text
source capability
-> credential/configuration availability
-> provider inspection/readback
-> separately authorized bounded mutation when needed
-> deployed browser/runtime proof
```

Do not infer live provider configuration from a workflow file, secret name, token display label, or successful unrelated Cloudflare build.

## Read-only hostname inventory boundary

The manual `Cloudflare Worker Git Authority Audit` separates its core provider-authority receipt from optional hostname enrichment. The primary Worker Git inspection requires the dedicated read-only Workers Builds user token and may proceed without DNS inventory or Request Trace credentials. Missing enrichment credentials leave that evidence lane `UNKNOWN` without suppressing the core readback. If enrichment is attempted but its credentials or provider reads fail, the bounded inventory/trace evidence may record that failure, but it cannot downgrade or upgrade the snapshotted core Worker Git authority `ok`/`error` verdict. If the core receipt is absent or failed, enrichment can never manufacture successful core authority.

When enrichment credentials are available, the audit may observe the live FCR zone without becoming deployment or DNS authority. On an exact SHA that is still current `main`, it may use dedicated read-only authorities to:

1. resolve the reviewed `foundercontrolroom.org` zone;
2. enumerate paginated A, AAAA, and CNAME records;
3. derive only in-zone HTTP-relevant hostname metadata without retaining DNS targets or origin IPs;
4. compare discovered hosts with `config/cloudflare-request-trace-host-policy.json`;
5. classify new hosts, missing required hosts, proxy-state drift, wildcards, DNS-only hosts, and trace-eligible proxied hosts; and
6. simulate Cloudflare Request Trace independently for each eligible proxied hostname.

The sanitized receipt may prove what that provider read observed at that time. Checked workflow/script source alone does not prove the current zone inventory, proxy state, Access behavior, origin identity, or runtime SHA. The audit explicitly remains `requestSimulation: true`, `runtimeShaVerified: false`, and `canAuthorizeProviderMutation: false`.

A failing or unavailable enrichment read is `UNKNOWN`/blocked evidence in that enrichment lane, not permission to infer the missing provider state, not a reason to rewrite the core Worker Git authority verdict, and not permission to mutate DNS, routes, Access, Workers, credentials, or deployment configuration.

## Required Worker secrets

Configure applicable secrets in the canonical Worker secret store and, where named by guarded workflows, in the GitHub `production` environment.

For the served remote read MCP, `FCR_REMOTE_MCP_READ_TOKEN` is a required canonical Worker secret and must be distinct from write-capable MCP/provider credentials. `FCR_REMOTE_MCP_READ_PROJECTS` is a public-safe server-held scope variable, not a secret.

Never copy secret values into repository files, logs, screenshots, issue comments, PR bodies, documentation, or public content. A secret name or presence check proves wiring only; provider acceptance/permission is a separate truth.

## Pre-deploy rollback receipt

The canonical manual `Deploy` workflow must capture provider-native rollback coordinates immediately after exact-head production authority validation and before any Supabase, Worker, or Pages mutation begins.

The read-only snapshot records:

- the currently active `founder-control-room` Worker deployment ID and complete version traffic distribution;
- the live Worker `/version` Git SHA;
- the current successful, non-skipped `founder-control-room` Pages production deployment on `main`, including its deployment ID and commit hash when available; and
- the exact candidate SHA the release intends to deploy.

The receipt is retained as `fcr-production-rollback-receipt@v1` in an exact-SHA Actions artifact. Missing or malformed Worker deployment/version identity, incomplete Worker traffic percentages, a missing eligible Pages production deployment, or an invalid runtime/candidate SHA blocks the release before production mutation instead of proceeding without a rollback target.

This receipt is rollback **preparation evidence**, not rollback execution and not proof that a rollback succeeded. Any rollback remains a separately authorized provider mutation and must target the recorded provider-native identities, then produce fresh provider/runtime proof.

## Verification gate

A merge or provider build does not prove activation. Production is verified only after the applicable authorized lane captures evidence against one exact current-main SHA.

At minimum verify:

1. `npm run build:pages` succeeds and contains required browser assets, `_headers`, and `_worker.js`;
2. the exact Pages artifact/deployment intended for production succeeds;
3. the canonical Worker deployment/version intended for production succeeds;
4. required secrets/configuration are available for the authorized scope;
5. the Pages `FCR_API` Service Binding is provider-proven to target the canonical `founder-control-room` Worker;
6. `https://api.foundercontrolroom.org/health` returns the expected service identity/health payload;
7. `https://foundercontrolroom.org/health` reaches the same canonical API service through the Pages binding;
8. `/version` or equivalent runtime identity matches the approved exact SHA where that contract applies;
9. authentication returns to `/control-room/` on the Pages origin;
10. required Playwright/browser proof runs against the deployed path; and
11. founder-content/provider claims use their own exact authorization and provider-readback gates.

Provider build/deploy comments, preview URLs, and successful uploads are useful evidence for the artifact they name. They do not substitute for runtime binding identity, auth, browser, publication, or fleet-wide proof.

## Documentation truth

When Pages proxy behavior, Worker identity, deployment authority, Cloudflare Access behavior, service bindings, secret interfaces, remote MCP scope, hostname-inventory/Request Trace behavior, Worker build-authority behavior, pre-deploy rollback capture, or runtime proof requirements change, update this document in the same bounded repository change.

Current executable source and authoritative provider readback outrank an older version of this runbook. Preserve older deployment evidence as historical provenance rather than deleting it.

## Rollback

- Pages: use the retained pre-deploy Pages deployment ID as the first rollback candidate, then verify the restored production deployment and runtime path.
- API Worker: use the retained pre-deploy Worker version distribution as the first rollback candidate through a separately authorized Worker version deployment, then verify service identity and exact runtime state.
- Proxy: revert the focused `public/_worker.js` change and matching deployment contract together; do not silently point the browser at an unverified origin.
- Service binding: revert only the affected Pages binding through separately authorized provider mutation; preserve unrelated bindings/configuration.
- Access: remove only the bounded exemption/change that was separately authorized, preserving unrelated Access policy.
- Credentials: remove/revoke only the affected credential; do not rotate unrelated keys to repair binding drift.
- Preserve the pre-deploy rollback receipt, build logs, deployment IDs, provider readback, browser traces, and runtime receipts.
