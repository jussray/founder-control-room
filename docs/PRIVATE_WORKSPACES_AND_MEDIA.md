# Private workspaces and media product contract

## Founder decision

Founder Control Room is a public product with a public entrance and login. Its first user's operational workspace is the founder's private workspace. Public visitors must never receive its projects, files, integrations, prompts, reports, account activity, media, destinations, credentials or operational receipts. Public descriptions and demonstrations require an explicitly public-safe projection; a visible login screen or hidden UI does not enforce access control.

Strangers may create their own accounts and isolated workspaces when the member-account implementation passes its gates. Signup, a matching email, a client-supplied role, a payment or a paid plan never makes a stranger the founder. Founder authority remains bound to the independently verified immutable Auth user ID in `founder_users.user_id`, not email alone. Anonymous identities have no founder authority. Missing founder ID bindings fail closed and require separately authorized operator review; signup must not repair or claim them automatically.

Member projects, files, references, jobs, output artifacts, connections, destinations and receipts must be scoped to the authenticated member's active workspace. Check ownership and membership on every object operation, including downloads, exports and background jobs. Enforce database/storage isolation as well as application authorization. Backend service credentials bypass RLS, so application checks cannot be delegated to RLS alone. Founder tables, credentials and provider grants must never become member defaults or shared fallbacks.

## Plans and benefits

Benefits must come from server-verified entitlements tied to the member and workspace. Do not trust a browser plan field, checkout redirect, unsigned webhook or client-declared payment. Verify provider events, bind them to the correct account, apply them idempotently and handle expiry, revocation and downgrade. Unknown billing or entitlement state fails closed for paid operations. Quotas and spending authorization are separate from publication authority. No price tiers, benefit quantities or production billing capability are established by this document.

## Media and destination authority

FCR is intended to generate, review, schedule and post Se'kret Bip media to its approved YouTube account through an actual configured transport. Canonical character references, exact source/output hashes, dialogue, storyboard, rights and human review remain bound to each production. The current creative direction is vertical 9:16, exactly 60 seconds, cinematic live action, faithful companion identities and no scrapbook frame. A render, provider completion or materialization receipt is a candidate, not visual approval or publishing permission.

An explicit valid schedule grant may authorize later posts without a new approval for every post. Such a grant must identify the authenticated grantor, owning workspace, exact permitted destination/account, approved content or an explicitly bounded reviewed-content set, allowed action, schedule/window, spending constraints, expiry and revocation. Revalidate those bindings and the exact content at execution; record an idempotent result and provider readback. Account connection, membership, a plan, an automation schedule or a vague request never implies standing publication authority. Missing, stale, revoked or out-of-scope grants block execution. A retry must not duplicate a post.

## Current evidence and missing implementation

Source inspection finds founder session/allowlist guards and a separate disabled-by-default public MCP reader. The reader verifies resource-bound tokens, active membership and tenant/object filters, returning only sanitized project summaries with `executionAuthorized:false`. This does not constitute general member signup or a paid workspace product.

Checked-in member signup/bootstrap, public-workspace schema/migrations and verified subscription billing enforcement remain absent or unverified. A source-only YouTube resumable-upload adapter and exact-scope customer publication gate now exist, but they are not wired to a service route, server-verified billing/review/grant stores, persistent idempotency ledger or live OAuth connection. No actual YouTube upload is verified. Public MCP references `fcr_public_memberships` and `fcr_public_projects`; their schema was not found in the inspected migrations. Existing unrelated commerce or provider integrations do not fill those gaps.

The private operator LOCAL_PROCESS media connection is implemented: durable approved-input jobs, actual local FFmpeg graphic rendering, an opt-in configured Runway image-to-video submit/poll adapter and bounded candidate materialization. Local graphics are not live-action generation. Mocked provider tests and a synthetic cross-project MP4 smoke do not prove a paid generation call, approved character appearance, lip sync, hosted execution, human review or a published YouTube artifact. See [media execution](MEDIA_JOB_EXECUTION.md).

Cloudflare connector reauthentication currently blocks direct provider configuration/log readback. GitHub check status can still be observed independently; it does not prove live founder binding, access isolation or production runtime parity. Those runtime facts remain UNKNOWN/BLOCKED until fresh authorized observations exist. Do not include credentials, raw provider payloads, private URLs or user records in receipts. Sauce Guard governs public-safe content and claims; it does not replace workspace authorization, tenant isolation or billing enforcement.

## Required next gates

1. Verify the real founder ID binding without mutating provider state; test same-email/different-ID and anonymous rejection, session revocation and founder-only routes.
2. Implement member authentication and transactional isolated workspace creation with application, database and storage ownership tests. Test two users attempting each other's objects and all founder surfaces; access-denied responses must not reveal another tenant's existence.
3. Implement an approved entitlement contract and verified billing adapter; test forged plans, unknown/expired state, duplicate events, revocation and quota boundaries before exposing paid benefits.
4. Wire the checked-in YouTube transport to an approved destination OAuth connection, revocable schedule-grant store and durable atomic post ledger; test mismatched workspace/account/content/hash, stale grants, failed readback and duplicate execution. Perform an explicitly authorized end-to-end provider witness before claiming publication.

## Scoped source repair and verification

The HTTP founder gates now match the database's immutable-user-ID contract and reject anonymous identities. Magic links cannot create or claim a founder account. Pages verifies `/auth/me` through the identified API service before serving founder console assets or the operational project relay, including on preview hostnames. Founder responses are private/no-store, and cookie rotation is preserved. The Node static server applies the same founder guard. Debug configuration and operational guardrail details require founder authentication; public `/version` retains only service and exact source SHA for release identification. The public product/login entrance remains available.

Verification on the combined source: `npm run build` passed; `npx vitest run src/http src/auth src/mcp src/worker/__tests__/cf-entry.test.ts` passed 890 tests across 129 suites; the separate public-tenant Node suite passed 8 tests; focused ESLint completed with zero errors and existing warnings. Pages packaging and its public-bundle leakage scan passed. Browser playback and production account access were not demonstrated. Read-only database metadata confirmed the matching FCR project and absence of the public MCP member tables; no live rows, grants, policies or account bindings were changed. Security advisors still require separate assessment before a broad account launch; advisor warnings alone are not proof of a data leak.

These are source and bounded read-only evidence. Exact successor provider checks and deployment must be recorded independently. This contract grants no merge, deploy, credential, spending or publication authority.

## Source-only YouTube Shorts adapter (review branch)

`src/lib/shortsPublicationGate.ts` checks verified member/workspace identity, active billed capability, approved 60-second vertical media, exact SHA-256, channel, visibility and revocable time-scoped grant. `src/lib/shortsYouTubeTransport.ts` reads only matching local bytes, checks the connected channel before claiming an upload, performs an HTTPS resumable upload to YouTube, validates the provider-controlled upload URL and re-reads the resulting video status. These functions require a trusted caller; their typed parameters are **not** proof of origin or a replacement for database RLS or verified billing. The caller must implement an atomic durable `claim` and `complete` to prevent duplicate uploads, and reconcile ambiguous provider outcomes before retry. Focused tests: `npm run verify:youtube-shorts-transport` (provider calls mocked). End-user account creation, multi-tenant migrations, Stripe webhook verification, OAuth, route wiring, hosted media storage, release CI and real provider playback/upload remain unfinished. No publication has been authorized by this code.
