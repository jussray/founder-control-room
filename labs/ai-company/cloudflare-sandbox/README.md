# AI Company Cloudflare Sandbox Lab

This is a standalone, source-only Cloudflare Sandbox Worker for the Founder
Control Room AI-company lab. It is deliberately not imported by the production
FCR Worker, has no account ID or route, and sets `workers_dev: false`.

## What it does

An authenticated internal caller may invoke one fixed synthetic evidence task:

- the only executable command is checked-in Python that emits a static L0,
  no-live-side-effects result;
- request data never reaches a shell command, file API, egress API, terminal,
  or preview URL;
- the exported Sandbox subclass sets `enableInternet = false`; it has no
  allowlist, outbound handler, tunnel, or service-exposure capability;
- each request derives an opaque disposable sandbox ID from a signed subject,
  timestamp, and nonce;
- each successful request destroys its sandbox before returning;
- a subject-scoped Durable Object rejects duplicate nonces and allows one
  request per minute.

It is **not** a browser sandbox, consumer feature, teen-data path, generic code
executor, repository checkout service, or production deployment.

## Caller contract

Only `POST /v1/synthetic-evidence` is accepted. The request has no body and
must include:

- `x-sandbox-subject`: an upstream-authenticated opaque session identifier;
- `x-sandbox-issued-at`: a 13-digit Unix-millisecond timestamp within five
  minutes of the worker clock;
- `x-sandbox-nonce`: an unpredictable single-use nonce;
- `x-sandbox-signature`: lowercase hex HMAC-SHA-256 using
  `SANDBOX_RUNNER_HMAC_KEY` over exactly:

```text
fcr-ai-company-sandbox/v1
POST
/v1/synthetic-evidence
<subject>
<issuedAt>
<nonce>
```

The caller must authenticate the principal before it constructs the signature.
The HMAC secret is a Worker secret; it must never be supplied by a browser,
logged, written into the sandbox, or copied into the primary FCR Worker without
an explicit cross-service credential decision.

## Local verification

```bash
npm install
npm run verify
```

`wrangler dev` and `wrangler deploy --dry-run` build the container image, so
Docker must be running. Do not deploy this lab until an owner has provisioned
the separate Worker, set `SANDBOX_RUNNER_HMAC_KEY`, and reviewed paid-plan,
container, egress, and retention settings.

## Adversarial proof

The Node test suite attacks the boundary at least ten ways across six classes:
authentication, signature tampering, input validation, freshness, replay/rate
control, and isolation/lifecycle. The contract test also verifies that the
Sandbox SDK and Docker image use the same pinned `0.7.0` version.

## Rollback

Delete or revert this isolated lab directory. It has no route, production
import, provider configuration, account credential, or deployment side effect.
