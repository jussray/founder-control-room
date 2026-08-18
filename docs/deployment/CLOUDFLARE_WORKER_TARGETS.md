# Cloudflare Deployment Targets

## Canonical topology

Founder Control Room uses Cloudflare Pages for the browser frontend and one canonical HTTP Worker for backend execution.

| Cloudflare surface | Domain / role | Repository source | Build / deploy command | Cron |
|---|---|---|---|---|
| Pages project | `foundercontrolroom.org` static frontend + same-origin edge proxy | `public/` via `scripts/build-pages.mjs` | Build: `npm run build:pages`; output: `dist-pages` | none |
| `founder-control-room` Worker | `api.foundercontrolroom.org` API, auth, MCP, reconciliation | `wrangler.worker.toml` | Build: `npm run build`; deploy: `npm run deploy` | every minute |
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

The current recovery evidence contract is deliberately fail-closed and public-safe:

- `expected_head_sha` is independently reduced to an exact lowercase 40-character SHA or literal `UNKNOWN` on the always-path before public output;
- Access-provider and browser receipt files are treated as untrusted JSON streams;
- each validator slurps the stream, requires exactly one parsed document, and validates only `.[0]` against bounded schema/type/enum rules;
- each public JSON projection independently slurps and projects only `.[0]`, preventing extra documents from being emitted even after validation;
- raw producer stdout/stderr and raw Access/browser receipt JSON are not published or retained as public evidence;
- raw browser origin/error text, matching Access application names/objects, free-form blocker/next-action prose, tokens, and raw provider payloads stay out of public issue comments, Actions summaries, and retained public artifacts;
- one sanitized Markdown receipt is reused for the fixed founder control issue, Actions summary, and retained artifact; and
- apply-mode approval references are validated but represented in the recovery authority summary only by a SHA-256 receipt, while read-only runs reject an approval reference.

Those guarantees describe **repository evidence handling**, not the live Cloudflare provider state. A sanitized receipt may truthfully report `missing`, `malformed`, or `UNKNOWN`; that is preferable to leaking or inventing provider truth.

Do not infer live provider configuration from a workflow file, secret name, token display label, sanitized receipt, or successful unrelated Cloudflare build.

## Required Worker secrets

Configure applicable secrets in the canonical Worker secret store and, where named by guarded workflows, in the GitHub `production` environment.

Never copy secret values into repository files, logs, screenshots, issue comments, PR bodies, documentation, or public content. A secret name or presence check proves wiring only; provider acceptance/permission is a separate truth.

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

When Pages proxy behavior, Worker identity, deployment authority, Cloudflare Access behavior, service bindings, secret interfaces, recovery evidence/publication boundaries, or runtime proof requirements change, update this document in the same bounded repository change.

Current executable source and authoritative provider readback outrank an older version of this runbook. Preserve older deployment evidence as historical provenance rather than deleting it.

## Rollback

- Pages: roll back to the prior verified Pages deployment.
- API Worker: redeploy the prior exact Worker SHA through the authorized Worker release path.
- Proxy: revert the focused `public/_worker.js` change and matching deployment contract together; do not silently point the browser at an unverified origin.
- Service binding: revert only the affected Pages binding through separately authorized provider mutation; preserve unrelated bindings/configuration.
- Access: remove only the bounded exemption/change that was separately authorized, preserving unrelated Access policy.
- Credentials: remove/revoke only the affected credential; do not rotate unrelated keys to repair binding drift.
- Preserve build logs, deployment IDs, provider readback, browser traces, and runtime receipts.
