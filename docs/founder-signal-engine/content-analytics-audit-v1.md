# Founder Content Analytics Audit v1

## Purpose

Turn overlapping social analytics exports into one deterministic, auditable founder-learning artifact without granting analytics any publishing or execution authority.

## Authority

The implementation lives in `tools/founder-content-contracts/content-analytics-audit-contract.cjs` because Founder Control Room owns founder-content evidence and learning boundaries. Analytics remain observation-only and advisory-only.

The audit output cannot:

- authorize or schedule publication;
- change approved content;
- execute provider actions;
- increase authority from engagement, reach, follower, or audience results.

Raw post text, DMs, comments, provider payloads, customer data, and private notes are rejected from the audit input.

## Reconciliation rules

1. Every export is a timestamped snapshot with an explicit date window.
2. When snapshots overlap, the latest captured observation wins for the same calendar day.
3. Any changed overlapping daily metric is retained as a revision record rather than silently overwritten.
4. Partial or otherwise incomplete days remain visible in data-quality metadata and are excluded from comparisons that claim complete evidence.
5. Missing comparison evidence returns `INCOMPLETE` and null derived metrics instead of fabricated zeroes.
6. Historical and recent windows are compared using per-day rates so different window lengths do not distort the conclusion.
7. Engagement concentration is calculated separately from impression concentration so broad distribution is not confused with resonance.
8. Audience composition changes are expressed as percentage-point deltas.
9. The complete audit identity is SHA-256 hashed for deterministic evidence comparison.

## Normalized input

Call `buildFounderContentAnalyticsAudit` with:

- `platform`
- `generated_at`
- at least two `snapshots`
- an explicit baseline/recent `comparison`
- optional `top_post_count`

Each snapshot may contain normalized daily metrics, post-level impression/engagement totals, headline metrics, and audience segment shares. Spreadsheet parsing stays outside the authority contract so LinkedIn, Buffer, HubSpot, or future providers can be normalized into the same evidence shape.

## Output

The returned `fcr/founder-content-analytics-audit` contains:

- reconciled daily observations;
- revision history for overlapping exports;
- complete/incomplete baseline and recent comparisons;
- per-day distribution and engagement-rate changes;
- current post engagement/impression concentration;
- audience-share deltas;
- partial-day and revision data-quality metadata;
- immutable advisory-only authority and privacy declarations;
- `audit_hash` for deterministic evidence identity.

## Verification fixture

`src/lib/__tests__/founderContentAnalyticsAudit.contract.test.ts` locks the overlapping-export case from the August 20, 2026 LinkedIn audit. It verifies that a later Aug 19 observation replaces the earlier incomplete attribution, Aug 20 stays partial, completed-day comparisons reproduce the audited baseline/recent totals, engagement concentration remains separate from reach concentration, and the analytics artifact cannot authorize publication.
