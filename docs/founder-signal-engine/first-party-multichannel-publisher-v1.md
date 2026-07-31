# First-Party Multichannel Publisher v1

Status: `CORE_IMPLEMENTED_AWAITING_PROVIDER_OAUTH_AND_LIVE_RECEIPTS`

Authoritative code:

- `src/lib/firstPartySocialPublisher.ts`
- `src/lib/__tests__/firstPartySocialPublisher.test.ts`
- `src/lib/founderSignalAutomationPolicy.ts`

## Founder outcome

Founder Control Room owns the publication policy, content contract, duplicate protection, and receipts instead of depending on a third-party content manager's plan quota.

This removes vendor-created post-count ceilings from the control plane. It does **not** bypass official platform API access, rate limits, OAuth scopes, media requirements, app review, account eligibility, or platform terms.

## Non-negotiable post contract

Every publishable social post must contain and retain:

1. **Traction** — the exact verified movement, result, ship, repair, learning, or audience signal.
2. **Governance advantage** — why the operating discipline, truth gate, safety boundary, rollback, or evidence system creates an advantage.
3. **Audience value** — why a follower, user, partner, customer, or builder should care.
4. **Investor signal** — why the evidence demonstrates execution, defensibility, distribution, trust, or commercial potential.
5. **Clickable proof** — at least one HTTPS proof URL, present in the final public copy.
6. **Exact source** — repository plus a 40-character commit SHA.
7. **Founder authority** — queue and publish require `publishAllowed=true` plus a founder approval receipt.
8. **Platform receipt** — success exists only after the destination returns a matching post ID, permalink, timestamp, source SHA, content hash, and proof URLs.

Prompt text, hidden instructions, unresolved templates, credentials, and raw evidence payloads are rejected.

## Channel coverage

The shared registry includes:

- LinkedIn
- Facebook Pages
- Instagram professional accounts
- Threads
- X
- TikTok
- YouTube
- Pinterest
- Bluesky
- Mastodon
- Google Business Profile, held behind provider re-verification

Each platform receives its own finished content field rather than one generic caption copied everywhere.

## Capability model

### Direct-text adapters

- LinkedIn
- Facebook Pages
- Threads
- X
- Bluesky
- Mastodon

### Media-required adapters

- Instagram
- Pinterest

### Provider-review-required adapters

- TikTok
- YouTube
- Google Business Profile

Provider-review-required means the platform remains blocked from live publication until the official developer app, account eligibility, permissions, review status, and real response path are verified.

## Character-limit policy

LinkedIn uses a 2,900-character safety ceiling, reserving 100 characters below the public 3,000-character limit.

X uses a 270-character safety ceiling, reserving 10 characters below the standard 280-character limit.

Every other destination must provide an explicit, currently verified account/platform character limit before queue or publication. Unknown limits fail closed instead of truncating proof or publishing malformed copy.

## Idempotency and duplicate protection

The engine creates:

- a SHA-256 content hash over the normalized post package;
- a SHA-256 idempotency key bound to platform, account, repository, commit, and content;
- a platform receipt that must return the same content hash and proof set.

A retry may reuse the idempotency key. A second post with the same key must be treated as a duplicate candidate, not new content.

## Product Design: Publishing Control Room

The operator surface should use five states:

1. **Evidence** — source repository, exact SHA, proof links, and verification status.
2. **Message** — traction, governance advantage, audience value, investor signal, and platform-native drafts.
3. **Destinations** — connected accounts, character counters, media readiness, permissions, and provider-review state.
4. **Authority** — draft, queue, or publish mode plus the founder approval receipt and rollback plan.
5. **Receipts** — per-platform status, external post ID, clickable permalink, content hash, timestamp, and retry/rollback state.

A green transport event is not a green publication. Only a destination receipt may turn a channel green.

## Secret boundary

Tokens, app secrets, refresh tokens, app passwords, and Page tokens stay in the secret store. They never enter:

- generated copy;
- GitHub commits;
- HubSpot notes;
- Zapier payloads;
- platform receipts;
- analytics exports;
- browser-visible configuration.

Code refers only to credential names such as `LINKEDIN_ACCESS_TOKEN` or `META_PAGE_ACCESS_TOKEN`.

## Rollback

1. Disable the standing social distribution grant.
2. Disable the affected platform adapter.
3. Stop retries for the idempotency key.
4. Preserve all receipts and failure details.
5. Remove a published post only through the official platform delete path after explicit founder approval.
6. Revert the focused repository PR if the shared contract itself is defective.

## Current proof boundary

Repository code and tests can prove validation, character ceilings, prompt rejection, media gates, idempotency, and receipt matching.

They do not prove a live social account is connected or that a real post was published. Live proof requires one controlled post per platform and a retained destination permalink receipt.

## Next gate

Implement official OAuth/account connection adapters, starting with the already connected LinkedIn identity, then run one founder-approved controlled LinkedIn post through the new engine. Expand to Facebook, Instagram, Threads, X, Bluesky, Mastodon, Pinterest, TikTok, and YouTube only after each platform's exact permissions and rollback path are verified.
