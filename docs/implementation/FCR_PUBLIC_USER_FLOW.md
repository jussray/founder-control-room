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

## Current implementation boundary

- The public site now links to `/account/` and the Pages worker serves `/account*` from static assets for GET/HEAD rather than proxying that route to `FCR_API`.
- A customer preview page explains public, proposed solo and proposed team states. It collects **no** email, password, token, or payment details.
- The existing `/welcome`, `/control-room/`, `/auth/*`, and `__Host-fcr_session` founder flows are **not** customer authentication.
- `/mcp/public` and its proposed tenant schema remain independently gated. Having a static customer page does not activate the MCP endpoint, migrate a table, or authenticate a customer.
- `public/_headers` marks the preview `Cache-Control: no-store` and denies training/search ingestion; the page itself is `noindex,nofollow`. It must not publish private product implementation details.
- Distinguish a public visitor, an authenticated customer, a tenant member, a plan-entitled user, and the privileged founder as **different** authority classes.

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

The Node checks assert source truth, required Pages assets, and Cloudflare Pages routing of `GET/HEAD /account*`. Actual Cloudflare, live customer auth, tenant RLS and checkout are not proven by these commands. Keep the existing founder visual and browser proofs intact.

## Cross-provider state at authoring

- GitBook connector yielded zero accessible organizations, so no GitBook space update or public docs publication was performed.
- GitLab `jussray-group/founder-control-room` is a separate two-file repository, not the active FCR application. Its original main pipeline `2674273847` failed with no created jobs. Diagnostic branch `fix/fcr-gitlab-pipeline-20261101`, commit `ec9d07b3`, switched security templates to the documented `Jobs/*` paths and added a repo contract job; its pipeline `3015406501` also immediately failed with zero jobs, `yaml_errors: null`. **GitLab CI remains blocked; root cause not verified.** Do not claim that a template swap repaired it or weaken security scans to manufacture green.

## Rollback

Revert the FCR customer page, homepage link, Pages static-path classification, asset requirement, and associated tests on the feature branch if needed; founder authentication remains unchanged. No personal data, billing or database changes to undo. Do not merge or deploy until appropriate exact-head and production gates pass.
