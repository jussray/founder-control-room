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

### Durable release-proof Workflow binding

The canonical Worker also exports `ReleaseProofWorkflowV0` and declares the same-Worker Cloudflare Workflows binding:

```text
binding: RELEASE_PROOF_WORKFLOW
name: fcr-release-proof-v0
class_name: ReleaseProofWorkflowV0
```

This binding is intentionally inert from application code in this slice: no public HTTP route, cron schedule, or other runtime path creates Workflow instances. It exists so later FCR-controlled orchestration can use Cloudflare's durable step/event state without creating a parallel release authority.

`ReleaseProofWorkflowV0` binds exact repository, target branch, base SHA, head SHA, optional PR identity, and a deterministic candidate fingerprint. It may correlate separately supplied evidence and founder-approval observations, but even a fully correlated run stops at `READY_FOR_FINAL_REREAD` with merge, deployment, and provider-mutation authority explicitly false. The final mutable provider/PR reread and any consequential action remain owned by the existing FCR authority membrane.

Repository configuration proves only the desired Workflow class/binding contract. It does not prove that Cloudflare has accepted the binding, that an instance exists or completed, or that any release/provider action occurred. Those are separate provider/runtime evidence gates.

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

The current recovery contract is intentionally narrower than general Access administration. The `FCR Access Front Door Recovery` workflow requires an exact requested SHA that still equals current `main`. Read-only inspection uses only `CLOUDFLARE_ACCESS_API_TOKEN`. Any apply or rollback uses only `CLOUDFLARE_ACCESS_ADMIN_API_TOKEN`, and `apply=true` additionally requires a fresh auditable founder approval reference whose raw value is not published.

The only permitted create target is:

```text
account: canonical FCR Cloudflare account
zone: foundercontrolroom.org
destination: foundercontrolroom.org/*
managed app: foundercontrolroom.org - public apex bypass
type: self_hosted
policy: Bypass / Everyone
```

The recovery does not mutate DNS, Worker routes, the database, account-level `deny_unmatched_requests_exempted_zone_names`, unrelated Access applications, or existing all-workers protection. If a non-managed application already owns the exact public destination, or the managed application is duplicated or has destination/policy drift, automatic repair fails closed for manual review.

A newly created public destination is only `mutated-needs-browser-proof`. Anonymous Playwright must then verify the recovered front door and exact runtime SHA. If that proof fails, rollback may delete only the run-created managed application after the receipt-bound account, zone, application ID, managed name, and exact destination are uniquely reacquired and still match. Ambiguity or drift blocks deletion rather than widening rollback authority.

Only a bounded sanitized recovery receipt may be returned to the fixed founder-control issue or retained as an artifact. Raw provider/browser receipts, raw approval references, managed application IDs, final origins, raw errors, and blockers remain outside public proof.

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

## Required Worker secrets and deployment-plane credentials

The canonical Worker runtime secret values belong in the Cloudflare Worker secret store. Canonical `.github/workflows/deploy.yml` preserves those provider-held values instead of copying them through GitHub Actions. The required runtime secret names are declared by `wrangler.worker.toml [secrets].required`, including `FOUNDER_SESSION_ENCRYPTION_KEY`; Wrangler must fail closed when a required binding name is absent before the Worker promotion can be treated as successful.

The canonical Deploy authority gate has a smaller GitHub production credential surface. It requires only the credentials needed to perform the release itself:

```text
SUPABASE_DB_URL
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Those deployment-plane values do not become Worker runtime bindings. Conversely, Worker runtime values such as `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `FOUNDER_SESSION_ENCRYPTION_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, MCP tokens, provider hook URLs, and review-email ingress secrets are not duplicated into the canonical Deploy authority gate.

The only runtime secret canonical Deploy deliberately writes is `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON`, and the checked-in value is fail-closed with `enabled:false`. This lets the release actively preserve the broad automation kill switch while leaving unrelated provider-held runtime secrets untouched.

`https://api.foundercontrolroom.org` is the canonical public API origin and therefore is source configuration, not a GitHub secret. Smoke proof, proof-of-ship runtime readback, and the post-Deploy production Playwright witness use that explicit origin. The witness still requires a successful canonical Deploy and binds direct Worker plus public Pages/proxy `/version` reads to the exact Deploy run SHA before and after the browser journey.

Trusted deterministic-review or other bounded workflows that actually need GitHub App execution credentials may continue to use their separately scoped Actions-facing `APP_ID` / `APP_PRIVATE_KEY` inputs. That does not make canonical Deploy responsible for re-uploading the Worker's provider-held `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` pair.

Never copy secret values into repository files, logs, screenshots, issue comments, PR bodies, documentation, or public content. A source declaration or required-name check proves only the intended boundary. Live provider secret presence, validity, permissions, deployment success, and runtime identity still require provider/runtime evidence.

## Verification gate

A merge or provider build does not prove activation. Production is verified only after the applicable authorized lane captures evidence against one exact current-main SHA.

At minimum verify:

1. `npm run build:pages` succeeds and contains required browser assets, `_headers`, and `_worker.js`;
2. the exact Pages artifact/deployment intended for production succeeds;
3. the canonical Worker deployment/version intended for production succeeds;
4. deployment-plane credentials pass the pre-mutation authority gate and provider-held Worker required-secret names pass the Wrangler binding membrane;
5. the Pages `FCR_API` Service Binding is provider-proven to target the canonical `founder-control-room` Worker;
6. `https://api.foundercontrolroom.org/health` returns the expected service identity/health payload;
7. `https://foundercontrolroom.org/health` reaches the same canonical API service through the Pages binding;
8. `/version` or equivalent runtime identity matches the approved exact SHA where that contract applies;
9. authentication returns to `/control-room/` on the Pages origin;
10. required Playwright/browser proof runs against the deployed path; and
11. founder-content/provider claims use their own exact authorization and provider-readback gates.

Provider build/deploy comments, preview URLs, and successful uploads are useful evidence for the artifact they name. They do not substitute for runtime binding identity, auth, browser, publication, or fleet-wide proof.

## Documentation truth

When Pages proxy behavior, Worker identity, deployment authority, Cloudflare Access behavior, service bindings, secret interfaces, remote MCP scope, hostname-inventory/Request Trace behavior, Worker build-authority behavior, Cloudflare Workflow bindings/orchestration authority, or runtime proof requirements change, update this document in the same bounded repository change.

Current executable source and authoritative provider readback outrank an older version of this runbook. Preserve older deployment evidence as historical provenance rather than deleting it.

## Rollback

- Pages: roll back to the prior verified Pages deployment.
- API Worker: redeploy the prior exact Worker SHA through the authorized Worker release path.
- Proxy: revert the focused `public/_worker.js` change and matching deployment contract together; do not silently point the browser at an unverified origin.
- Service binding: revert only the affected Pages binding through separately authorized provider mutation; preserve unrelated bindings/configuration.
- Access: remove only the run-created managed `foundercontrolroom.org/*` public-bypass application when its receipt-bound identity and scope still match; otherwise stop for manual review.
- Credentials: remove/revoke only the affected credential; do not rotate unrelated keys to repair binding drift.
- Preserve build logs, deployment IDs, provider readback, browser traces, and runtime receipts.

## Canonical public browser-proof origin

The public browser-proof origin and the Cloudflare Access destination intentionally have different scopes. The canonical anonymous browser origin is `https://www.foundercontrolroom.org`, while the bounded Access recovery destination remains the zone-wide `foundercontrolroom.org/*` target.

The FCR Access recovery receipt must therefore require `requestedOrigin` to equal `https://www.foundercontrolroom.org` exactly. An apex redirect or any other final-origin mismatch remains unproven browser truth rather than being normalized into success. This source contract does not change DNS, Worker routes, Access configuration, or provider authority, and it cannot prove the live redirect or Access state without fresh provider and browser evidence.
