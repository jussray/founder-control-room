# Remote MCP OAuth Compatibility Contract

Status: SOURCE_REPAIR_CANDIDATE

## Purpose

Make the canonical Founder Control Room remote MCP (`https://api.foundercontrolroom.org/mcp`) compatible with Supabase OAuth 2.1 without inventing custom OAuth semantics or widening provider authority.

## Canonical trust chain

```text
OAuth client
  -> Supabase OAuth 2.1 Authorization Code + PKCE
  -> FCR founder consent surface at /oauth/consent
  -> Supabase access + refresh tokens
  -> FCR /mcp bearer verification
  -> exact OAuth client allowlist
  -> exact client -> operator map
  -> server-owned project grant
  -> FCR tool authority checks
  -> optional bounded peer relay
```

OAuth authenticates a user and identifies the client. It does not grant repository mutation, merge, deploy, publish, billing, provider-mutation, or execution authority.

## Supabase-compatible token contract

FCR accepts the standard Supabase OAuth access-token shape:

- issuer: this FCR Supabase Auth project;
- audience: `authenticated` by default;
- subject: the verified Supabase user id;
- `client_id`: exact OAuth client identity;
- expiry/not-before validation;
- Supabase `getUser(token)` revocation/user verification;
- founder allowlist membership.

FCR does **not** require:

- custom scope `mcp:read`;
- custom `mcp_projects` access-token claim;
- a custom access-token hook merely to make the MCP bridge function.

Supabase OAuth scopes currently describe OIDC/UserInfo disclosure. They are not FCR authorization. The canonical FCR scope is the standard `email` scope unless a separately reviewed standard scope is configured.

## FCR authorization remains server-owned

The project grant remains `FCR_REMOTE_MCP_READ_PROJECTS` on the FCR server. The OAuth client cannot widen this grant by token content or request arguments.

Peer relay requires all of the following:

1. OAuth token passes issuer/audience/time/revocation/founder checks;
2. token `client_id` is present in `FCR_REMOTE_MCP_OAUTH_CLIENT_IDS`;
3. the exact same client id is mapped in `FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP`;
4. the requested peer operator is enabled for the requested bounded capability;
5. provider adapter exists for that exact provider;
6. response contract and provider evidence validate;
7. the zero-authority envelope remains false for mutation/merge/deploy/publish/provider mutation.

Static-token compatibility clients cannot use peer relay.

## Consent boundary

Supabase OAuth Server should use:

- Site URL: the canonical FCR Pages origin;
- Authorization Path: `/oauth/consent`;
- Authorization Code + PKCE;
- refresh-token flow for durable clients.

FCR serves `/oauth/consent` from Pages and proxies consent detail/decision requests through `/auth/oauth/...` to the API Worker.

Consent approval requires the interactive opaque HttpOnly FCR founder session. Automation bearer credentials cannot approve an OAuth grant.

Browser JavaScript never receives the stored FCR founder access/refresh token pair. Only the server-side consent proxy uses the founder access token to call Supabase Auth.

## Client registration

Do not treat dynamic registration as operator authority.

A new OAuth client, including a dynamically registered MCP client, remains unusable for `fcr_relay_operator` until its exact client id is deliberately added to both:

- `FCR_REMOTE_MCP_OAUTH_CLIENT_IDS`;
- `FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP`.

No wildcard client ids.

For the first ChatGPT bridge, prefer an exact registered/observed client id over automatically mapping arbitrary dynamically registered clients to `codex`.

## Production configuration gate

Source compatibility is not proof that the hosted Supabase OAuth Server is enabled.

Production must prove:

1. OAuth 2.1 Server enabled in the FCR Supabase project;
2. authorization path resolves to `/oauth/consent` on the intended FCR Site URL;
3. OAuth/OIDC discovery returns the intended authorization/token/registration metadata;
4. the exact ChatGPT/MCP client is registered or dynamically registered;
5. its exact client id is present in the FCR allowlist/operator map;
6. token exchange and refresh work;
7. the resulting access token reaches `/mcp` and is accepted;
8. `fcr_relay_operator -> claude-code` returns provider evidence bound to the exact request;
9. browser/Playwright proves the founder-visible round trip on the same deployed head.

Until those runtime gates pass, classify the no-copy-paste bridge as `PARTIAL`, not `VERIFIED`.

## Environment contract

```text
FCR_REMOTE_MCP_RESOURCE=https://api.foundercontrolroom.org/mcp
FCR_REMOTE_MCP_OAUTH_ISSUER=https://oojzfmmywbvficgybaxd.supabase.co/auth/v1
FCR_REMOTE_MCP_OAUTH_AUDIENCE=authenticated
FCR_REMOTE_MCP_OAUTH_SCOPES=email
FCR_REMOTE_MCP_OAUTH_CLIENT_IDS=<exact client ids>
FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP={<exact client id>:<operator>}
FCR_REMOTE_MCP_READ_PROJECTS=<server-owned project grant>
```

`FCR_REMOTE_MCP_OAUTH_REQUIRED_SCOPE` is a deprecated migration alias and should remain empty in new deployments.

## Rollback

Revert the compatibility PR. No database migration, provider credential rotation, billing change, or authority widening is part of this source repair.
