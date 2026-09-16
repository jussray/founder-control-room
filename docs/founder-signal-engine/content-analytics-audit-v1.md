# Founder Content Analytics Audit v1

## Purpose

Turn overlapping social analytics exports into one deterministic, auditable founder-learning artifact without granting analytics any publishing or execution authority.

## Authority

The authority contract lives in `tools/founder-content-contracts/content-analytics-audit-contract.cjs`. The normalized CSV ingestion adapter lives beside it in `tools/founder-content-contracts/content-analytics-csv-ingest.cjs`. Founder Control Room owns founder-content evidence and learning boundaries.

Analytics remain observation-only and advisory-only. Neither an audit nor an ingestion receipt can:

- authorize or schedule publication;
- change approved content;
- execute provider actions;
- increase authority from engagement, reach, follower, or audience results.

Raw post text, DMs, comments, provider payloads, customer data, and private notes are rejected from the authority-contract input.

## Business question

The artifact answers one bounded question:

> What changed in distribution, engagement, follower movement, post concentration, and audience composition between comparable observed windows for one identified account?

It does **not** infer revenue, customer intent, causal lift, or publication success unless a separate evidence source proves those claims.

## Reconciliation rules

1. Every export is a timestamped snapshot with an explicit date window.
2. Account/page identity is explicit and is part of the ingestion receipt identity.
3. Each source file is bound by filename, SHA-256, byte count, row count, and import provenance.
4. Snapshot capture timestamps are strict UTC timestamps; date windows use real `YYYY-MM-DD` calendar dates.
5. `historical_import` and `current_export` provenance remain explicit rather than being inferred from ordering.
6. Duplicate daily dates inside one snapshot and duplicate capture provenance hidden behind another snapshot id are rejected.
7. When valid snapshots overlap, the latest captured observation wins for the same calendar day.
8. Any changed overlapping daily metric is retained as a revision record rather than silently overwritten.
9. Partial or otherwise incomplete days remain visible in data-quality metadata and are excluded from comparisons that claim complete evidence.
10. Missing metric evidence remains `null`; incomplete comparison evidence returns `INCOMPLETE` rather than fabricated zeroes.
11. Metric names and units are fixed by the normalized schema: counts for impressions, engagements, and gross new followers; ratios for audience shares; percentage points for audience deltas.
12. Audience segments are explicit data labels, with prototype-sensitive names rejected before object materialization.
13. Historical and recent windows are compared using per-day rates so different window lengths do not distort the conclusion.
14. Engagement concentration is calculated separately from impression concentration so broad distribution is not confused with resonance.
15. The complete audit identity is SHA-256 hashed for deterministic evidence comparison; the outer ingestion receipt has a deterministic idempotency key bound to provenance.

## Normalized input

The CSV adapter requires these exact columns:

```text
snapshot_id,captured_at,window_start,window_end,import_kind,row_type,date,complete,impressions,engagements,gross_new_followers,audience_segment,audience_share
```

The caller must also supply explicit metadata for platform, generated timestamp, account id/name, source filename, and baseline/recent comparison windows. Provider-specific spreadsheets must be normalized into this schema before ingestion; a raw provider payload is not accepted as canonical evidence.

The adapter feeds `buildFounderContentAnalyticsAudit`, whose normalized snapshots may contain daily metrics, post-level impression/engagement totals, headline metrics, and audience segment shares.

## Output

The returned `fcr/founder-content-analytics-csv-ingest@v1` receipt contains:

- account identity;
- source filename, SHA-256, size, and row count;
- snapshot ids, capture times, windows, and historical/current import provenance;
- metric names, units, and nullability;
- explicit audience segments and share deltas;
- deterministic idempotency key;
- the nested `fcr/founder-content-analytics-audit` artifact;
- immutable observation-only authority declarations.

The nested audit contains reconciled daily observations, revision history, complete/incomplete comparisons, distribution and engagement-rate changes, post concentration where supplied, audience-share deltas, data-quality metadata, and `audit_hash`.

## Verification fixtures

`src/lib/__tests__/founderContentAnalyticsAudit.contract.test.ts` locks the overlapping-export reconciliation behavior.

`src/lib/__tests__/founderContentAnalyticsCsvIngest.contract.test.ts` ingests the safe fixture at `src/lib/__tests__/fixtures/founder-content-analytics-safe.csv` and proves account/source binding, timestamps, historical imports, metric units, null semantics, duplicate rejection, audience segments, provenance, idempotency, and observation-only authority.

Safe fixture proof establishes the ingestion contract only. It does **not** prove that a live provider export was obtained for the current account or time window. That receipt remains separate and must cite the authorized provider/source used.
