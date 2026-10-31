# FCR Public MCP Phase 1 — Source Candidate / NOT LIVE

## Goal
Enable independently authenticated customers to inspect only explicitly
connected, sanitized project records, without exposing FCR's founder portfolio.

## Changes proposed
- New `/mcp/public` JSON-RPC endpoint, entirely separate from existing `/mcp`.
- New public-only tenant/membership/project data ports and strict output projection.
- Supabase Auth `getUser(token)` verification, signed claim correlation, client-ID allowlist,
  issuer, expiry, `nbf`, required `openid` scope, and canonical signed resource binding.
  Generic Supabase `aud=authenticated` alone is explicitly insufficient.
- Two OAuth-scoped read-only tools; no operator relay, writes, provider actions,
  founder portfolio list, raw repository patches, credentials, or cross-project reads.
- Authenticated membership changes control access. A caller-supplied project ID
  cannot expand authority, and unknown/foreign IDs share a generic denial.
- Opt-in activation only: `FCR_PUBLIC_MCP_ENABLED=true` **after** independent proof.

## Source-level environment configuration (not production proof)
- `FCR_PUBLIC_MCP_ENABLED`: defaults disabled; only `true` enables endpoint.
- `FCR_PUBLIC_MCP_OAUTH_CLIENT_IDS`: allowlisted OAuth client identifiers,
  e.g. a verified provided client or verified CIMD URL; never copy passwords or secrets.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and service-role key continue to be
  server-held bindings. The public client must never receive service-role access.
- `GET /.well-known/oauth-protected-resource/mcp/public` advertises the issuer.

## Blockers BEFORE enabling
1. Validate existing Supabase OAuth 2.1 support, registration, PKCE, consent UI,
   dynamic-client configuration, scope discovery, refresh/revocation, and `resource`
   indicator handling. The verifier now requires the exact public MCP URL as
   a signed `aud` or `resource` claim, along with `openid` scope. Tokens
   presenting only generic Supabase `aud=authenticated` correctly fail closed.
   Prove the actual issuer can mint a resource-bound token before enabling;
   do not fabricate a claim or weaken checks to make a connector appear green.
2. Convert `FCR_PUBLIC_TENANCY_SCHEMA_PROPOSAL.sql` into a reviewed migration
   with the project's own migration workflow; run RLS and tenant-isolation SQL
   tests under anonymous, user-A, user-B, OAuth, and service-role contexts.
3. Add public account/tenant onboarding and explicit project connection grants.
   No founder user/project rows may be imported into the new public tables by default.
4. Define and verify explicit permission revocation, customer account deletion,
   consumer data privacy, and read-audit receipts without raw payload retention.
5. Run repo tests and exact-head CI: `npm run verify:mcp`, `npm test`,
   `npm run typecheck`, `npm run lint`, `npm run build` and live MCP test.
   Node-only tests prove only pure contract logic, not Express or Cloudflare.
6. Independently inspect client setup, private application policies, OAuth
   security scheme compatibility, Terms/Privacy/support URLs, demo accounts,
   and plugin-directory submission rules. Do not publish this package as live.

## Exact-head verification integration
The existing `npm run verify:mcp` now invokes the public-plugin static review
and seven isolated tenancy/OAuth unit tests after its existing MCP checks.
A passing `verify:mcp` proves only repository checks at that exact commit;
it does not establish a live OAuth consent flow, tenant RLS, migration,
production deployment, or public directory listing. The HTTP integration
tests remain in the repository's Vitest suite (`npm test`).

## Authority and rollback
This patch is a proposal; it changes no live provider or database. The server
route defaults to 503 before activation. Turning the feature off is the safe
rollback for this source. No founder auth route, repository permission, merge,
deploy, secret, publication, or destructive action is modified.

## Tested locally in preparation
`node --experimental-strip-types --test tests/publicTenantAccess.node.test.mjs`
checks pure tenant/OAuth logic using fixed fixture rows. `vitest` HTTP tests
are included for execution in the full repository, but were **not** run in the
artifact-only environment.


## Binding, provenance, and browser-session boundary — 2026-10-31 candidate

- The canonical Cloudflare Worker is \`founder-control-room\` at
  \`api.foundercontrolroom.org\`. The repository candidate does **not** establish
  live MCP/plugin activation or authorize a production deployment.
- A read-only Cloudflare inspection on 2026-10-31 found the existing
  \`CF_API_TOKEN\` Worker binding classified \`plain_text\`. The value was
  not inspected or copied. This is a release blocker until that credential is
  safely replaced, reviewed for exposure, and the binding type is reverified.
- Both canonical GitHub production workflows now call
  \`node scripts/verify-worker-binding-types.mjs\` before provider mutation;
  the check fails closed when provider metadata is unavailable or credential
  binding types are unsafe. It inspects only names and types and logs a
  SHA-256 fingerprint of sorted names/types, **never binding values**.
- FCR's founder browser session uses a server-owned, opaque
  \`__Host-fcr_session\` cookie with Secure/HttpOnly/SameSite=Strict. It must
  remain separate from OAuth bearer authentication for public MCP users.
  No visitor/device fingerprinting, third-party tracking cookie, or cross-site
  recognition is introduced by this candidate.
- The public MCP route remains disabled until genuine OAuth consent, issuer,
  client registration, tenant grants, RLS, revocation, and authenticated
  cross-tenant tests have production proof. No placeholder OAuth client ID or
  bypass token may substitute for these prerequisites.
