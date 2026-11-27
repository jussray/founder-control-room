# SYNC Party Growth Outcome Ingestion

## Current truth

This document describes the bounded Founder Control Room source contract for reading first-party SYNC Party growth evidence.

Source state on this branch:

- FCR has a founder-authenticated dashboard read path at `GET /dashboard/sync-party-growth?campaign=<campaign-id>`.
- The reader fetches SYNC runtime identity before and after the protected growth summary. A stable URL alone is never treated as runtime identity.
- The FCR-side credential name is `SYNC_PARTY_GROWTH_READ_KEY`.
- The SYNC-side credential name is `GROWTH_READ_KEY`.
- Both names must be provider-held bindings containing the same secret value for live reads to succeed.
- No secret value belongs in GitHub source, docs, logs, screenshots, PR text, or chat-visible receipts.
- The route is read-only and observation-only. It grants no publication, merge, deploy, campaign, provider-mutation, or product authority.
- Source implementation does not prove either provider-held credential is configured.

Until provider readback and one authenticated live read succeed, classify the live FCR outcome lane as **BLOCKED / credential configuration unverified** rather than active.

## Ownership

SYNC owns authoritative product-event evidence.

FCR consumes a bounded aggregate observation for cross-campaign learning. It does not create a second game analytics authority and does not rewrite SYNC events into broader business semantics.

```text
SYNC browser/server events
-> SYNC GrowthLedger Durable Object
-> protected /api/growth/summary
-> exact runtime identity bracket (/api/version before + after)
-> founder-authenticated FCR dashboard observer
-> bounded product-native evidence
-> later FCR learning/outcome decisions
```

## Product-native funnel

The source event vocabulary is preserved exactly:

- `landing_view`
- `play_intent`
- `room_created`
- `room_joined`
- `game_started`
- `game_finished`
- `rematch_started`

These are event counts, not automatically people, games, signups, revenue, or retention.

`game_started`, `game_finished`, and `rematch_started` can be emitted for participating players. FCR therefore must not relabel those counters as a unique game count.

`rematch_started` is not a returning user. Cross-session return remains `UNKNOWN` until a separate return/retention contract exists.

FCR must also keep these semantics `UNKNOWN` unless separately evidenced:

- signups
- returning users
- referrals
- paid conversions / revenue

## Safe evidence shape

A successful FCR observation may expose only the bounded aggregate fields already produced by the SYNC ledger:

- requested campaign id
- source-reported campaign key
- campaign fingerprint
- exact runtime SHA and Cloudflare build id
- sequence number
- unique visitor count
- product-native event counters
- source / medium / content aggregate counts
- first and last timestamps
- recent event fingerprints and non-private event metadata

FCR intentionally does not forward event ids from recent-event records and does not ingest nicknames, answers, messages, raw referrer paths, customer data, or provider secret values through this path.

## Empty campaign boundary

An untouched named campaign Durable Object can return the SYNC ledger's generic empty default with:

```text
campaign_key = unattributed
seq = 0
```

Therefore FCR stores these as separate facts:

- `requestedCampaignId`: what FCR asked SYNC to read;
- `sourceCampaignKey`: what the source ledger returned;
- `emptyLedger`: whether the source sequence is zero.

FCR must never rewrite an empty named campaign as attributed evidence merely because the request carried a campaign name.

## Stable-URL / runtime-identity law

The Workers URL is a locator, not an immutable runtime identity.

For each successful growth observation FCR reads `/api/version` before and after `/api/growth/summary`. A known observation requires the same exact SHA and build id on both version reads. If the runtime moves between reads, the result is `UNKNOWN / RUNTIME_MOVED_DURING_READ` and no counters are promoted as a version-bound observation.

Historical proof from an earlier SHA does not transfer to a successor merely because the URL is unchanged.

## Fail-closed states

The reader returns `UNKNOWN` rather than guessing when any of these occur:

- invalid campaign id
- missing FCR provider-held read key
- unavailable or invalid SYNC runtime identity
- SYNC growth summary not configured
- read key rejected
- source HTTP/network error
- malformed source body
- runtime identity changes during the read

A missing credential causes no outbound summary request.

## Provider activation gate

Source code cannot perform or prove provider secret installation.

Live activation requires all of the following as separate evidence:

1. provider-held `GROWTH_READ_KEY` exists on the intended SYNC Worker;
2. provider-held `SYNC_PARTY_GROWTH_READ_KEY` exists on the intended FCR Worker;
3. their values match without being exposed;
4. exact deployed FCR runtime contains this source contract;
5. an authenticated founder read succeeds;
6. the returned observation carries a stable exact SYNC runtime identity and expected campaign id;
7. a controlled known-empty or known-event case is read without secret or private-data leakage.

Do not add `SYNC_PARTY_GROWTH_READ_KEY` to FCR's global startup-required secret list merely to make this feature exist. This capability must fail closed at its own boundary so unrelated FCR startup/deploy authority does not become dependent on optional SYNC analytics availability.

## Current next gate

1. Earn exact-head source/CI proof for this branch.
2. Review and obtain founder approval for the exact PR candidate before merge.
3. Merge only after the normal FCR authority gates are satisfied.
4. Configure the two provider-held secret bindings without exposing their value.
5. Re-observe exact deployed FCR and SYNC identities and execute one authenticated live growth read.
6. Only then begin using first-party player outcomes inside the FCR learning loop.
