# FCR Public Customer Journey — Source Candidate (NOT LIVE)

**Owner:** Juss & Co / Founder Control Room
**Authoritative app repository:** `jussray/founder-control-room` on GitHub
**Branch:** `feat/fcr-public-customer-flow-20261101`
**Scope:** Public Pages entry and isolation tests. No production authentication, billing, private tenant records, deployment, or publication.

## User path

1. **Public discovery:** `/` and `/work.html` remain browsable without an account.
2. **Customer entry:** `/account/` is a Pages-hosted customer landing route, not the privileged FCR API.
3. **Plan comparison:** public explorer is usable; solo and team workspaces are explicitly marked proposed, without prices or promises of paid access.
4. **Account verification:** creation is disabled until actual customer authentication, verified email or provider sign-in, session revocation, consent, and abuse protections have passed.
5. **Tenant provisioning:** after a verified login, a trusted server may create *new public tenant records* and one initial customer membership. Never import the founder identity, projects, API keys, approvals, or governed project records by default.
6. **Workspace:** after tenant-bound authorization, show only customer-owned projects, consumption, and entitlements. Every tool call enforces actor, tenant, action, and current plan; anonymous/browser role cannot elevate itself.
7. **Billing:** show and enable prices/checkout only after the product, payment provider, webhook verification, billing lifecycle, refunds, customer delivery, and entitlement-to-provider round trip are proven. Never grant a paid feature based on a client-supplied plan field.

## Added customer workspace read API — source candidate

- `GET /customer/status` reports public browsing enabled; registration, checkout and paid capabilities disabled. It advertises the read-only API gate separately.
- `GET /customer/workspace` is a **bearer-only read** that defaults to 503 unless `FCR_PUBLIC_CUSTOMER_WORKSPACES_ENABLED=true`. It is not enabled in this change.
- When and only when a correctly configured verified identity provider and tenant schema are independently proven, the route uses Supabase Auth `getUser(token)` to validate a bearer token, requires a non-anonymous user with a confirmed email, and applies the existing strict public-tenant membership projector.
- Database access uses `src/mcp/publicTenantReader.ts`, the same bounded public-only adapter used by `/mcp/public`. Its only tables are `fcr_public_memberships` and `fcr_public_projects`, with explicit user and tenant filters, strict output projection and row caps.
- JSON responses include only a verified account ID and sanitized public project summaries; execution, paid capabilities, checkout and connected-provider permissions remain `false` irrespective of user metadata.
- Missing/invalid bearer = 401, foreign or invalid membership = 404, unavailable DB or issuer = 503. The existing opaque founder cookie never authenticates this route.
- This is **not a public login or account creation interface**. There is no front-end token collector and no identity cookie for customers yet. No user should be asked to authenticate to an unavailable workflow.

## Current implementation boundary

- The public site now links to `/account/` and the Pages worker serves `/account*` from static assets for GET/HEAD rather than proxying that route to `FCR_API`.
- A customer preview page explains public, proposed solo and proposed team states. It collects **no** email, password, token, or payment details.
- The existing `/welcome`, `/control-room/`, `/auth/*`, and `__Host-fcr_session` founder flows are **not** customer authentication.
- `/mcp/public` and its proposed tenant schema remain independently gated. Having a static customer page does not activate the MCP endpoint, migrate a table, or authenticate a customer.
- `public/_headers` marks the preview `Cache-Control: no-store` and denies training/search ingestion; the page itself is `noindex,nofollow`. It must not publish private product implementation details.
- Distinguish a public visitor, an authenticated customer, a tenant member, a plan-entitled user, and the privileged founder as **different** authority classes.

## Production schema inspection — November 1, 2026

Connected Supabase project `oojzfmmywbvficgybaxd` was read using schema metadata only. The existing `public.fcr_public_*` table set, grants, and policies are **absent**. Existing production migrations do not include the public tenancy proposal. The prior candidate's five GitHub build/security checks succeeded; Supabase Preview was skipped. This is **not** a passing database, identity, or customer release proof.

Review SQL: `docs/implementation/FCR_PUBLIC_TENANCY_REVIEW_CANDIDATE.sql` (source only, **not applied**). It creates separate public tenants, memberships, projects, billing receipts, and entitlements; tightens default-deny grants and RLS; and has no client mutations. The earlier `FCR_PUBLIC_TENANCY_SCHEMA_PROPOSAL.sql` is superseded for execution: its `auth.jwt()->>'client_id'` requirement would reject ordinary first-party sessions with no OAuth client claim.

The paid entitlement policy in `src/mcp/publicCustomerEntitlements.ts` requires a confirmed customer identity, active matching tenant membership, a future-valid paid plan, matching service-held verified receipt, and independent feature activation. It is **not mounted as a live paid API**. The current `/customer/workspace` always reports `paidCapabilitiesAuthorized: false`.

Run `npm run verify:public-customer-flow` for source and mocked-unit assertions. Before enabling anything, generate and review a proper Supabase CLI migration on isolated staging, run a genuine tenant A/B/revoked/anonymous SQL RLS matrix, verify customer-only Auth callback/recovery/logout, prove trusted payment webhook idempotency and entitlement revocation, and capture exact deployment receipts. None of these live gates have passed here.

## Required proof before activating customer accounts

- Exact target Supabase Auth project verified; customer-only login, callback, logout and recovery flow; verified auth tokens; secure HttpOnly cookies; CSRF and rate limiting.
- Reviewed/apply-once migration based on `docs/implementation/FCR_PUBLIC_TENANCY_SCHEMA_PROPOSAL.sql`; RLS and grants confirmed with anonymous, customer A, customer B, revoked user, founder, and service-role tests.
- Server-created memberships; least-privilege tenant access; authorization on every read, tool invocation, paid entitlement and account deletion.
- End-to-end account creation and verified login on mobile and desktop; no false emails/payments/success screens; measured rate/abuse protections.
- Verified checkout and webhook replay/idempotency, cancellation, refunds and spend caps before enabling paid tiers.
- Current GitHub exact-head CI, Cloudflare deployment and application identity, database migration readback, browser runtime, and privacy review. No red required checks may pass into a merge.
- Separate explicit approvals for merge, database migration, deployment, billing, and publication; none follow from this source commit.

## Source-level checks

```sh
npm run verify:public-customer-flow
npm run build:pages
npm run verify:founder-home
```

The static checks assert source truth, required Pages assets, and Cloudflare Pages routing of `GET/HEAD /account*`. The Node and Vitest tests cover read-only tenant isolation and API failure states with fixtures and injected verifiers. These tests have not been executed in this session. Passing them would not prove live Cloudflare routing, customer authentication, tenant RLS, or checkout. Keep the existing founder visual and browser proofs intact.

## Cross-provider state at authoring

- GitBook connector yielded zero accessible organizations, so no GitBook space update or public docs publication was performed.
- GitLab `jussray-group/founder-control-room` is a separate two-file repository, not the active FCR application. Its original main pipeline `2674273847` failed with no created jobs. Diagnostic branch `fix/fcr-gitlab-pipeline-20261101`, commit `ec9d07b3`, switched security templates to the documented `Jobs/*` paths and added a repo contract job; its pipeline `3015406501` also immediately failed with zero jobs, `yaml_errors: null`. **GitLab CI remains blocked.** An explicit API pipeline creation attempt returned HTTP 400 with GitLab's message: **Identity verification is required in order to run CI jobs**. This is a provider-side account verification gate, not evidence of a YAML syntax failure. Complete GitLab's legitimate verification requirement before running the edited pipeline; then validate the YAML and scans independently. Do not claim that a template swap repaired it, bypass verification, or weaken security scans to manufacture green.

## Rollback

Revert the FCR customer page, homepage link, Pages static-path classification, asset requirement, and associated tests on the feature branch if needed; founder authentication remains unchanged. No personal data, billing or database changes to undo. Do not merge or deploy until appropriate exact-head and production gates pass.
