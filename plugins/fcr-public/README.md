# Founder Control Room public MCP plugin — PRE-RELEASE

This is an additive package candidate for `jussray/founder-control-room`. It does **not** change existing founder-only routes, authorize a deployment, or provide a working public MCP server by itself.

## Package location

`plugins/fcr-public/` in the repository. The ZIP variant places `plugin.json` and `mcp.json` at its root. It follows OpenAI's portable Agent Plugins packaging conventions.

## Proposed public endpoint

`https://api.foundercontrolroom.org/mcp/public` is included as **disabled-by-default candidate source** in the accompanying patch, not a verified deployed endpoint. The existing founder OAuth endpoint remains at `/mcp`. Do **not** repoint the public plugin at `/mcp` or `/mcp/read` as a shortcut.

## Required production integration and verification (not completed in this artifact)

1. Activate and verify a distinct user-facing OAuth 2.1 connection flow with discovery, PKCE where applicable, user consent, resource audience, token expiry/refresh and revocation, per-tool `securitySchemes`, and matching `mcp/www_authenticate` challenges. Public identity must not require membership of `founder_users`.
2. Resolve each user to a server-verified tenant and project membership. Assign grants from the server-side datastore, never unverified bearer-token project slugs or caller parameters. Ensure queries filter by tenant ID at the database boundary with RLS where supported. A user's project slug must not be an authorization key.
3. Build a new public MCP tool catalog, starting with safe user-owned project listing, sanitized project evidence reads, and proposal-only work. **Never reuse all eight founder tool definitions** or expose `fcr_relay_operator` in this launch phase.
4. Preserve the founder-only `/mcp`, `/mcp/read`, and the existing governance, approval, and provider authorization routes untouched. Founder tools stay behind current allowlist and proof gates.
5. Enforce rate limits, abuse monitoring, privacy controls, bounded responses, input validation, output redaction, revocation, and audit/receipt persistence without retaining raw inputs/results or credentials.
6. Create two independent demo tenants (A, B) plus an existing founder identity, and prove the 8 review cases in `review/test-cases.json`, including no cross-tenant access and no authority elevation.
7. Run exact-commit `npm run verify:mcp`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, integration tests, Playwright where a UI changes, and live authenticated MCP client discovery against the deployed Cloudflare Worker. Record full results and runtime identity.
8. Provide verified HTTPS website, support, privacy, and terms URLs, a demo recording, a dedicated review account, and accurate production tool metadata. Perform the required domain verification, OAuth login and tool scan. **Only then** prepare a submission.

## Configuration caveat

The plugin `mcp.json` deliberately declares OAuth without a fabricated `clientId`, client secret or registration URL. Register a supported OAuth client or implement valid DCR/CIMD; the actual choice must match the production identity provider's verified capabilities. A secret must never be committed to the manifest.

## Authority gate

The maintainer alone decides whether to commit, open a PR, merge, deploy, give reviewer access, submit, or publish. This artifact is a local proposal; no provider or account state was changed.

## Verification

Run `node scripts/verify-fcr-public-plugin.mjs` from the repository root after copying the proposed files in their indicated paths. This verifies package structure, permission-boundary language, and review-case shape; it does **not** prove authentication, server deployment, tests, CI, or user isolation in a runtime.

## Public route candidate (new in patch)

The patch adds a disabled-by-default `/mcp/public` endpoint with a two-tool read-only catalog, server-verified Supabase OAuth user identity, client-ID allowlisting, and tenant-scoped membership/project reads. It does **not** supply public account creation, the production OAuth consent UI, a live database migration, persisted external read receipts, or production runtime proof. It uses the OIDC `openid` scope and enforces database read permissions independently through memberships. The proposed schema is a design file, not an applied migration. Never enable `FCR_PUBLIC_MCP_ENABLED` until the remaining gates are verified.
