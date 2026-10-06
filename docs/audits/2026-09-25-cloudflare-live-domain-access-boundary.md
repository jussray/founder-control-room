# Cloudflare live-domain Access boundary — 2026-10-05

Status: `SOURCE POLICY / PROVIDER STATE REQUIRES FRESH READBACK / RUNTIME PROOF REQUIRED`

## Canonical boundary

Founder Control Room separates the public discovery doorway from product execution:

- `foundercontrolroom.org` and `www.foundercontrolroom.org`: public doorway;
- `app.foundercontrolroom.org`: Cloudflare Access required before product-app execution;
- `api.foundercontrolroom.org`: Cloudflare Access required before direct API execution.

A source declaration is not proof that a hostname is live, routed, or currently protected. Provider readback and runtime evidence remain separate gates.

## API machine compatibility

Putting Access in front of the API must not strand machine integrations.

The API Access policy therefore has two bounded machine patterns:

1. direct release/diagnostic requests such as `/health`, `/version`, and `/guardrails.json` remain Access-protected and canonical GitHub release workflows authenticate with the dedicated `FCR_CLOUDFLARE_ACCESS_CLIENT_ID` / `FCR_CLOUDFLARE_ACCESS_CLIENT_SECRET` service-token pair;
2. standards-based or application-authenticated machine ingress that cannot carry a second Cloudflare credential uses exact path-scoped Access exceptions only for `/mcp`, `/mcp/*`, `/.well-known/oauth-protected-resource*`, and `/ingest/jira-work-automation`. Those exceptions do not authenticate the request; FCR's OAuth/static bearer/Jira bearer checks remain mandatory.

No wildcard bypass may cover unrelated API paths.

## Browser/runtime proof

A random stranger must:

1. reach the apex/WWW doorway without a Cloudflare Access product-login screen;
2. remain outside the authenticated founder shell;
3. receive an Access-specific redirect/path marker when directly requesting `https://api.foundercontrolroom.org/version`;
4. prove the exact canonical Worker separately through `https://foundercontrolroom.org/version`, which reaches `founder-control-room` through the Pages `FCR_API` Service Binding.

A generic 401/403 or body text such as "Access denied" is not enough to attribute the denial to Cloudflare Access.

## App boundary

`app.foundercontrolroom.org` belongs behind Access with no public doorway exemption. Until provider/DNS/runtime evidence proves that exact hostname is live, the source contract records the required target state without claiming deployment.

## Authority

This source repair does not mutate Cloudflare Access, DNS, Worker routes, service tokens, secrets, deployments, databases, billing, or publication state. Provider changes require their own exact-main authority and fresh readback.

## Rollback

Before merge, reset the PR branch to its predecessor exact head. After a lawful merge, revert the focused source/doc/test commit. Provider rollback is a separate operation because this patch performs no provider mutation.
