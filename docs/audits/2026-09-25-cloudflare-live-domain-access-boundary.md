# Cloudflare live-domain Access boundary — current source contract

Status: `SOURCE POLICY ONLY / PROVIDER STATE REQUIRES FRESH READBACK`

## Canonical host boundary

- `foundercontrolroom.org` and `www.foundercontrolroom.org` are the public discovery/front-door hosts.
- `app.foundercontrolroom.org` is an Access-required product-app host.
- `api.foundercontrolroom.org` is Access-required by default.

The machine-readable source is `config/fcr-cloudflare-access-boundary.json`. Source truth never proves that DNS, Access applications, policies, service tokens, or path-specific applications are currently installed.

## Direct API machine authentication

Direct release/diagnostic paths such as `/health`, `/version`, `/guardrails`, `/guardrails.json`, and write-capable FCR MCP remain behind Access. Trusted GitHub workflows authenticate with the dedicated `FCR_CLOUDFLARE_ACCESS_CLIENT_ID` and `FCR_CLOUDFLARE_ACCESS_CLIENT_SECRET` pair using `CF-Access-Client-Id` and `CF-Access-Client-Secret`.

A missing credential must fail the machine proof. The source change does not install or rotate those credentials.

## Exact application-authenticated exceptions

Some Internet-origin machine protocols cannot carry a second Cloudflare service token and already have their own cryptographic, OAuth, OIDC, HMAC, or bearer membrane. Only the exact paths listed in `config/fcr-cloudflare-access-boundary.json` may receive separately reviewed path-scoped Access bypass applications.

The list deliberately does **not** contain `/mcp/*`. In particular, `/mcp/founder-signal-engine` and `/mcp/founder-signal-x-engagement` remain Access-protected.

`/ingest/founder-review-email` is not a public exception. The review-email Worker invokes it through the `FOUNDER_CONTROL_ROOM_API` Service Binding, so no public Access bypass is required.

## Browser/runtime evidence

A random stranger must reach apex/WWW without a Cloudflare Access product-login screen and must remain outside the authenticated founder shell.

A direct anonymous request to `https://api.foundercontrolroom.org/version` must present Access-specific Cloudflare redirect/path evidence. A generic 401/403 is insufficient.

Exact Worker identity is proven separately through `https://foundercontrolroom.org/version`, which reaches the canonical Worker through the Pages `FCR_API` Service Binding.

## App host

`app.foundercontrolroom.org` belongs behind Access. Until fresh provider/DNS/runtime evidence proves that exact hostname is live and bound, this file records desired source policy only.

## Authority

This source repair does not mutate Cloudflare Access, DNS, routes, service tokens, Worker deployments, databases, billing, publication, or secrets. Provider reconciliation remains a separate exact-main founder-authorized operation.
