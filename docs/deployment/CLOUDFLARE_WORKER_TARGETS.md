# Cloudflare Deployment Targets

## Canonical topology

Founder Control Room uses Cloudflare Pages for the browser frontend and one canonical HTTP Worker for backend execution.

| Cloudflare surface | Domain / role | Repository source | Build / deploy command | Cron |
|---|---|---|---|---|
| Pages project | `foundercontrolroom.org` static frontend + same-origin edge proxy | `public/` via `scripts/build-pages.mjs` | Build: `npm run build:pages`; output: `dist-pages` | none |
| `founder-control-room` Worker | `api.foundercontrolroom.org` API, auth, MCP, reconciliation | `wrangler.worker.toml` | Build: `npm run build`; deploy: `npm run deploy` | every minute |
| `chief-ai` Worker | private proposal/reasoning capability consumed by FCR through `CHIEF_AI` | `jussray/chief-ai-machine` | independently released Chief Worker | none from FCR |
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

### Chief AI service-binding boundary

The canonical FCR Worker has one outbound Cloudflare Service Binding for Chief AI:

```text
binding: CHIEF_AI
service: chief-ai
entrypoint: FounderControlRoomEntrypoint
rpc contract: juss-v10/chief-fcr-rpc@v1
capability-plan contract: juss-v10/capability-plan@v1
```

This binding is deliberately one-way. FCR may ask the named Chief entrypoint for a release/version receipt or a proposal-only capability plan. Chief receives no reverse FCR binding, merge capability, terminal capability, approval capability, Supabase credential, GitHub credential, or execution authority from this relationship.

FCR treats the binding as load-bearing at Worker startup and revalidates every Chief response across the trust boundary. A usable response must identify service `chief-ai`, match the checked-in RPC contract and capability-plan contract, and include a full Chief runtime release SHA. A successful capability-plan response is then independently validated by FCR's V10 capability-plan validator before it may enter the existing founder-control path.

The founder-authenticated FCR routes are:

```text
GET  /founder-os/chief/version
POST /founder-os/chief/capability-plan
```

The POST route remains behind the existing same-origin browser mutation gate in the canonical FCR HTTP server. Neither route grants execution. Chief remains proposal-only and FCR remains the authority boundary for registry resolution, exact-head verification, founder approval, receipts, and downstream execution gates.

Checked-in `[[services]]` configuration proves repository intent only. Before calling the Chief/FCR path live, require authoritative Cloudflare readback or deployed-path evidence proving `CHIEF_AI` resolves to service `chief-ai` and named entrypoint `FounderControlRoomEntrypoint` in the intended account/environment.

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

## Required Worker secrets

Configure applicable secrets in the canonical Worker secret store and, where named by guarded workflows, in the GitHub `production` environment.

`CHIEF_AI` is a Cloudflare Service Binding, not a shared application secret. Do not add a duplicate Chief API token merely to recreate a boundary Cloudflare already provides. If future Chief methods require a separate authorization layer, add it as a separately reviewed contract rather than silently widening this binding.

Never copy secret values into repository files, logs, screenshots, issue comments, PR bodies, documentation, or public content. A secret name or presence check proves wiring only; provider acceptance/permission is a separate truth.

## Verification gate

A merge or provider build does not prove activation. Production is verified only after the applicable authorized lane captures evidence against one exact current-main SHA.

At minimum verify:

1. `npm run build:pages` succeeds and contains required browser assets, `_headers`, and `_worker.js`;
2. the exact Pages artifact/deployment intended for production succeeds;
3. the canonical Worker deployment/version intended for production succeeds;
4. required secrets/configuration are available for the authorized scope;
5. the Pages `FCR_API` Service Binding is provider-proven to target the canonical `founder-control-room` Worker;
6. the FCR `CHIEF_AI` Service Binding is provider-proven to target `chief-ai` at `FounderControlRoomEntrypoint`;
7. the founder-authenticated Chief version route reports service `chief-ai`, RPC contract `juss-v10/chief-fcr-rpc@v1`, capability-plan contract `juss-v10/capability-plan@v1`, and the intended Chief release SHA;
8. a founder-authenticated capability-plan request traverses the binding and returns a proposal that FCR independently validates while execution remains unauthorized;
9. `https://api.foundercontrolroom.org/health` returns the expected service identity/health payload;
10. `https://foundercontrolroom.org/health` reaches the same canonical API service through the Pages binding;
11. `/version` or equivalent runtime identity matches the approved exact SHA where that contract applies;
12. authentication returns to `/control-room/` on the Pages origin;
13. required Playwright/browser proof runs against the deployed path; and
14. founder-content/provider claims use their own exact authorization and provider-readback gates.

Provider build/deploy comments, preview URLs, and successful uploads are useful evidence for the artifact they name. They do not substitute for runtime binding identity, auth, browser, publication, or fleet-wide proof.

## Documentation truth

When Pages proxy behavior, Worker identity, deployment authority, Cloudflare Access behavior, service bindings, secret interfaces, or runtime proof requirements change, update this document in the same bounded repository change.

Current executable source and authoritative provider readback outrank an older version of this runbook. Preserve older deployment evidence as historical provenance rather than deleting it.

## Rollback

- Pages: roll back to the prior verified Pages deployment.
- API Worker: redeploy the prior exact Worker SHA through the authorized Worker release path.
- Proxy: revert the focused `public/_worker.js` change and matching deployment contract together; do not silently point the browser at an unverified origin.
- Pages service binding: revert only the affected `FCR_API` Pages binding through separately authorized provider mutation; preserve unrelated bindings/configuration.
- Chief service binding: remove or revert only `CHIEF_AI` and its matching named Chief entrypoint change; do not create a public-token fallback to mask binding failure.
- Access: remove only the bounded exemption/change that was separately authorized, preserving unrelated Access policy.
- Credentials: remove/revoke only the affected credential; do not rotate unrelated keys to repair binding drift.
- Preserve build logs, deployment IDs, provider readback, browser traces, and runtime receipts.
