# Se’kret Bip Entry-Flow Fingerprint

> **Private / canonical supersession record.** This record supersedes prior splash-centric launch wording without deleting historical documents.

## Founder decision

**Current product decision: Se’kret Bip no longer has a canonical splash flow.**

No AI, growth workflow, launch plan, content campaign, webchat integration, or waiting-list implementation may assume `SplashScreen`, `WebWelcomeScreen`, `parent-splash`, an invisible splash CTA, or any other named entry surface merely because an older plan or test mentions it.

## Current repository observation

Repository: `jussray/Sekret-Bip`

Observed `main` during the 2026-08-23 fingerprint audit:

- `app/index.tsx` still imports and renders `SplashScreen` for non-web entry;
- `app/index.tsx` still renders `WebWelcomeScreen` for web entry;
- unauthenticated routing still references `/(onboarding)/parent-splash` and `/(onboarding)/welcome`;
- `test/auth-onboarding-runtime.test.mjs` still asserts the older splash/welcome contract.

Therefore the current repository implementation is **STALE against the founder product decision** for the entry experience.

This is implementation drift, not permission to restore or preserve the old splash as product canon.

## Canonical rule

Growth and launch systems bind to an **entry-flow fingerprint**, not to a screen name.

The binding is:

```text
social / referral / direct visit
→ current verified public entry surface
→ account recognition or account creation
→ required onboarding / consent only where incomplete
→ preview, waiting-list, or invited-access state
→ persistent relationship and updates
```

The current verified UI decides what the first visible surface is. The Growth Inbox must not own or hard-code it.

## Fingerprint schema

Every material public entry-flow decision should carry:

```text
fingerprint_id
project
repository
exact_main_sha
entry_owner_path
entry_surface_id
entry_surface_semantics
account_recognition_path
new_user_path
incomplete_user_path
waitlisted_user_path
invited_user_path
webchat_attach_point
analytics_event_contract
visual_evidence_reference
playwright_evidence_reference
route_test_reference
product_decision_reference
status: VERIFIED | STALE | UNKNOWN | BLOCKED
observed_at
expires_at_or_recheck_trigger
```

A fingerprint is valid only for its exact repository/head and evidence window. If the entry implementation, route graph, product decision, or launch state changes, the prior fingerprint becomes `STALE` and must be regenerated.

## Waiting-list invariant

The waiting-list relationship remains durable regardless of which visual entry surface is current.

- recognized users do not repeat completed onboarding;
- new users complete only the minimum required account/onboarding steps;
- waitlisted users receive a persistent recognized state;
- invited users route through the approved access gate;
- the entry surface may change without invalidating the account relationship;
- a visual redesign does not reset consent, waitlist, referral, or launch history.

## Growth Inbox binding

Unified Growth Inbox and webchat integrations may record:

```text
entry_flow_fingerprint_id
entry_surface_id
campaign_fingerprint_id
content_fingerprint_id
source_platform
source_content_id
waitlist_state
conversation_id
conversion_state
```

They must not infer the current UX from legacy names such as `splash`.

If `entry_flow_fingerprint_id` is missing or stale, growth attribution may be stored as `UNKNOWN`, but the system must not invent a route or claim a verified funnel.

## Fingerprint families

Use fingerprints as the continuity layer across the whole launch system:

- **entry-flow fingerprint** — exact UI/routing experience;
- **content fingerprint** — hook, thesis, angle, proof, CTA, saturation, and performance lineage;
- **campaign fingerprint** — audience, channel, offer, timing, CTA, landing target, and approval;
- **evidence fingerprint** — exact SHA, test, screenshot, trace, provider witness, and freshness;
- **consent fingerprint** — exact consent copy/version, purpose, source, channel, and timestamp;
- **revenue fingerprint** — attribution from source through collected payment without treating projections as cash.

These fingerprints connect decisions without collapsing their separate authority domains.

## Current status

```text
FOUNDER PRODUCT DECISION: VERIFIED — no canonical splash
CURRENT REPOSITORY IMPLEMENTATION: STALE — old splash/welcome code remains
GROWTH INBOX ENTRY BINDING: BLOCKED from naming a UI surface until refreshed
WAITING-LIST RELATIONSHIP MODEL: VALID as a surface-independent invariant
```

## Next repair gate

Audit the current desired Se’kret Bip front door, select the intended visual target, remove or bypass obsolete splash-specific runtime paths with the smallest reversible patch, update route tests, and obtain Playwright evidence on the exact repaired head.

Until then, Growth Inbox must use the generic `entry_flow_fingerprint_id` contract and must not block its observe-only backend work on a particular visual surface.