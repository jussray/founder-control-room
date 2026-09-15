# Founder Content Analytics Audit v1

## Purpose

Turn overlapping social analytics exports into one deterministic, auditable founder-learning artifact without granting analytics any publishing or execution authority.

## Authority

The authority contract lives in `tools/founder-content-contracts/content-analytics-audit-contract.cjs` because Founder Control Room owns founder-content evidence and learning boundaries. The normalized CSV ingestion adapter lives beside it in `tools/founder-content-contracts/content-analytics-csv-ingest.cjs`.

Analytics remain observation-only and advisory-only. Neither the audit nor an ingestion receipt can:

- authorize or schedule publication;
- change approved content;
- execute provider actions;
- increase authority from engagement, reach, follower, or audience results.

Raw post text, DMs, comments, provider payloads, customer data, and private notes are rejected from the authority-contract input.

## Business question

The artifact answers a bounded question: **what changed in distribution, engagement, follower movement, post concentration, and audience composition between comparable observed windows for one identified account?**

It does not infer revenue, customer intent, causal lift, or publication success unless a separate evidence source proves those claims.

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
10. The CSV ingestion boundary rejects duplicate daily dates and duplicate audience segments inside one snapshot instead of silently choosing a winner.
11. CSV provenance is bound to the exact file bytes, file name, account identity, import kind, capture timestamps, and snapshot windows.
12. Re-ingesting the same bytes with the same metadata produces the same `idempotency_key`; a provenance change produces a different ingestion identity.

## Normalized authority input

Call `buildFounderContentAnalyticsAudit` with:

- `platform`;
- `generated_at`;
- at least two `snapshots`;
- an explicit baseline/recent `comparison`;
- optional `top_post_count`.

Each normalized snapshot may contain daily metrics, post-level impression/engagement totals, headline metrics, and audience segment shares.

The core authority contract intentionally does not parse provider-native spreadsheets. Parsing and provenance stay outside that authority primitive so LinkedIn, Buffer, HubSpot, or future providers can normalize into the same evidence shape without changing publication authority.

## Normalized CSV ingestion boundary

`parseFounderContentAnalyticsCsv` accepts a deliberately narrow, provider-neutral CSV format plus explicit metadata. This is an ingestion boundary, not a claim that a provider's native CSV already has this shape.

Required metadata:

- `platform`;
- `generated_at`;
- `account_id`;
- `account_name`;
- `file_name`;
- `comparison`;
- optional `top_post_count`.

Exact CSV columns:

```text
snapshot_id,captured_at,window_start,window_end,import_kind,row_type,date,complete,impressions,engagements,gross_new_followers,audience_segment,audience_share
```

`import_kind` is either `historical_import` or `current_export`. `row_type` is either `daily` or `audience`.

The ingestion receipt records:

- account/page identity;
- exact source-file SHA-256 and byte/row counts;
- capture timestamps and windows per snapshot;
- historical/current import provenance;
- metric names and units;
- explicit `audience_segment` rows;
- deterministic `idempotency_key`;
- the nested advisory analytics audit.

Units are explicit:

- `impressions`, `engagements`, `gross_new_followers`: non-negative counts or null where the source is unknown;
- `audience_share`: ratio from 0 to 1;
- `audience_delta`: percentage points.

An empty count cell becomes `null`, never zero. A comparison requiring that null value becomes `INCOMPLETE`.

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

The CSV adapter returns an outer `fcr/founder-content-analytics-csv-ingest@v1` receipt that adds account, source, units, historical-import provenance, explicit audience-segment naming, and an idempotency key without increasing authority.

## Verification fixtures

`src/lib/__tests__/founderContentAnalyticsAudit.contract.test.ts` locks the overlapping-export case from the August 20, 2026 LinkedIn audit. It verifies that a later Aug 19 observation replaces the earlier incomplete attribution, Aug 20 stays partial, completed-day comparisons reproduce the audited baseline/recent totals, engagement concentration remains separate from reach concentration, and the analytics artifact cannot authorize publication.

`src/lib/__tests__/founderContentAnalyticsCsvIngest.contract.test.ts` reads the safe CSV fixture at `src/lib/__tests__/fixtures/founder-content-analytics-safe.csv`. It verifies source hashing, account identity, historical/current import provenance, explicit metric units, `audience_segment`, duplicate rejection, null handling, deterministic idempotency, and advisory-only authority.

A safe fixture proves the ingestion implementation. It is **not** evidence that any external analytics account is connected or current. A real-data receipt requires an authorized analytics source or a separately supplied export; absence of that source blocks only the real-data receipt, not this contract verification.
