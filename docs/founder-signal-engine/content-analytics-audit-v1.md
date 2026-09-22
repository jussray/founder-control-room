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

The core artifact answers a bounded question: **what changed in distribution, engagement, follower movement, post concentration when post-level evidence is actually present, and audience composition between comparable observed windows for one identified account/page?**

The normalized CSV interchange answers only the dimensions its schema carries: daily distribution/engagement/follower metrics and audience composition. Because that CSV schema has no post-level rows, its receipt explicitly marks post concentration `UNAVAILABLE`; an empty top-post list is never treated as evidence that the account had no posts or no concentration.

It does not infer revenue, customer intent, causal lift, or publication success unless a separate evidence source proves those claims.

## Reconciliation rules

1. Every export is a timestamped snapshot with an explicit date window.
2. When snapshots overlap, the latest captured observation wins for the same calendar day.
3. Any changed overlapping daily metric is retained as a revision record rather than silently overwritten.
4. Partial or otherwise incomplete days remain visible in data-quality metadata and are excluded from comparisons that claim complete evidence.
5. Missing comparison evidence returns `INCOMPLETE` and null derived metrics instead of fabricated zeroes.
6. Historical and recent windows are compared using per-day rates so different window lengths do not distort the conclusion.
7. Engagement concentration is calculated separately from impression concentration only when post-level evidence exists; ingestion paths that cannot represent posts must mark concentration unavailable.
8. Audience composition changes are expressed as percentage-point deltas.
9. The complete audit identity is SHA-256 hashed for deterministic evidence comparison.
10. The CSV ingestion boundary rejects duplicate daily dates and duplicate audience segments inside one snapshot instead of silently choosing a winner.
11. CSV provenance preserves exact file bytes, file name, account and page identity, import kind, normalized UTC capture timestamps, snapshot windows, and receipt generation time.
12. Logical import idempotency is bound to stable normalized evidence identity: contract, platform, account ID, page ID, canonical snapshot evidence, comparison window, and normalized top-post scope. Exact source-file SHA-256, file name, account display name, and receipt-generation time remain provenance and do not mint a second logical import when normalized evidence is unchanged. Reordering otherwise identical CSV rows does not change logical identity; changing a metric, snapshot identity/metadata, or comparison scope does.
13. A daily CSV observation must fall inside its own snapshot's declared `window_start` and `window_end`; out-of-window rows are rejected rather than allowed to contaminate a comparison.
14. `generated_at` and every snapshot `captured_at` must be offset-aware ISO timestamps. Accepted explicit offsets are normalized to UTC before delegation to the core audit, while local-time guesses and impossible calendar instants are rejected at the evidence boundary.
15. Quoted CSV fields must terminate at a comma, newline, or end-of-input; trailing text after a closing quote is malformed evidence and is rejected.
16. Snapshot IDs and other provenance identifiers are bounded at ingress so downstream normalization cannot silently truncate identity.
17. Distinct snapshots must have distinct normalized `captured_at` instants. Equal-time snapshots are rejected rather than letting CSV row order choose audience or revision truth.
18. A snapshot cannot claim observations from the future relative to its own capture. Its normalized `captured_at` must be on or after its declared `window_end` and no later than receipt `generated_at`.
19. Audience-shift evidence is bound to the declared baseline/recent comparison windows. The ingestion path resolves those windows to distinct covering snapshots and rejects extra oldest/latest snapshots that would make the audience comparison scope ambiguous.
20. Reconciled baseline/recent impression and engagement totals must remain within JavaScript's exact safe-integer range. Individually valid cells whose range sum would exceed `Number.MAX_SAFE_INTEGER` are rejected before the core audit can hash rounded totals.

## Normalized authority input

Call `buildFounderContentAnalyticsAudit` with:

- `platform`;
- `generated_at`;
- at least two `snapshots`;
- an explicit baseline/recent `comparison`;
- optional `top_post_count`.

Each normalized snapshot may contain daily metrics, post-level impression/engagement totals, headline metrics, and audience segment shares.

The core authority contract intentionally does not parse provider-native spreadsheets. Parsing and provenance stay outside that authority primitive so LinkedIn, Buffer, HubSpot, or future providers can normalize into the same evidence shape without changing publication authority.

### Native-provider boundary

LinkedIn already has a load-bearing provider-native path: `scripts/linkedin_analytics_continuity.py` reads LinkedIn aggregate XLSX exports and emits `linkedin-analytics-continuity@v1` / `linkedin-native-post-measurement@v1` evidence. That path remains the canonical LinkedIn-native importer and is exercised by the repository's Python CI contract.

The normalized CSV adapter is additive provider-neutral interchange only. It must not:

- replace or silently fork the LinkedIn-native importer;
- relabel a provider-native XLSX file as normalized CSV evidence;
- turn caller-supplied account/page labels into provider-authenticated identity;
- donate a generic CSV hash or fixture result to a separate native-provider receipt.

A provider-specific importer may normalize into the generic authority shape only when its own source provenance and account/page identity remain explicit and independently verifiable.

## Normalized CSV ingestion boundary

`parseFounderContentAnalyticsCsv` accepts a deliberately narrow, provider-neutral CSV format plus explicit metadata. This is an ingestion boundary, not a claim that a provider's native CSV already has this shape.

Required metadata:

- `platform`;
- `generated_at` as an offset-aware ISO timestamp;
- `account_id`;
- `account_name`;
- `page_id`;
- `file_name`;
- `comparison`;
- optional `top_post_count`, which defaults canonically to `2` when omitted and must be a positive safe integer when supplied.

Exact CSV columns:

```text
snapshot_id,captured_at,window_start,window_end,import_kind,row_type,date,complete,impressions,engagements,gross_new_followers,audience_segment,audience_share
```

`import_kind` is either `historical_import` or `current_export`. `row_type` is either `daily` or `audience`. Every `captured_at` must include `Z` or an explicit UTC offset; accepted offsets are normalized to UTC in the receipt and delegated audit. Distinct snapshots must not normalize to the same capture instant, and a snapshot capture cannot precede its own `window_end`.

The ingestion receipt records:

- account identity and separate page identity;
- exact source-file SHA-256 and byte/row counts as immutable provenance;
- source file name as provenance rather than logical idempotency authority;
- receipt-generation time as provenance rather than logical idempotency authority;
- normalized capture timestamps and windows per snapshot;
- historical/current import provenance;
- metric names and units;
- explicit `audience_segment` rows;
- explicit metric availability, including `post_concentration: UNAVAILABLE` for this CSV schema;
- deterministic logical `idempotency_key` over canonical normalized evidence and stable comparison identity;
- the nested advisory analytics audit.

Units are explicit:

- `impressions`, `engagements`, `gross_new_followers`: non-negative counts or null where the source is unknown;
- `audience_share`: ratio from 0 to 1;
- `audience_delta`: percentage points.

An empty count cell becomes `null`, never zero. A comparison requiring that null value becomes `INCOMPLETE`. Comparison-range impression and engagement totals must also remain exactly representable as JavaScript safe integers; otherwise ingestion fails closed rather than emitting rounded analytics.

## Output

The returned `fcr/founder-content-analytics-audit` contains:

- reconciled daily observations;
- revision history for overlapping exports;
- complete/incomplete baseline and recent comparisons;
- per-day distribution and engagement-rate changes;
- current post engagement/impression concentration when post-level evidence exists;
- audience-share deltas;
- partial-day and revision data-quality metadata;
- immutable advisory-only authority and privacy declarations;
- `audit_hash` for deterministic evidence identity.

The CSV adapter returns an outer `fcr/founder-content-analytics-csv-ingest@v1` receipt that adds account/page identity, source provenance, units, historical-import provenance, explicit audience-segment naming, metric availability, and a logical idempotency key without increasing authority. For this schema, `metric_availability.post_concentration.state` is `UNAVAILABLE`, so consumers must not interpret the nested audit's empty post collection as an observed no-post result.

## Verification fixtures

`src/lib/__tests__/founderContentAnalyticsAudit.contract.test.ts` locks the overlapping-export case from the August 20, 2026 LinkedIn audit. It verifies that a later Aug 19 observation replaces the earlier incomplete attribution, Aug 20 stays partial, completed-day comparisons reproduce the audited baseline/recent totals, engagement concentration remains separate from reach concentration, and the analytics artifact cannot authorize publication.

`src/lib/__tests__/founderContentAnalyticsCsvIngest.contract.test.ts` reads the safe CSV fixture at `src/lib/__tests__/fixtures/founder-content-analytics-safe.csv`. It verifies source hashing, account/page identity, historical/current import provenance, explicit metric units, `audience_segment`, duplicate rejection, snapshot-window binding, null handling, offset-aware timestamps, logical idempotency across file/display metadata and row-order changes, changed-evidence separation, and advisory-only authority.

`src/lib/__tests__/founderContentAnalyticsCsvIngest.reviewRegressions.test.ts` locks review-found edge cases: UTC normalization for explicit offsets, canonical top-post scope, unavailable post-concentration evidence, malformed quoted fields, bounded snapshot identities, capture/window chronology, equal-capture rejection, comparison-bound audience snapshots, and safe-integer aggregate bounds.

A safe fixture proves the ingestion implementation. It is **not** evidence that any external analytics account/page is connected or current. A real-data receipt requires an authorized analytics source or a separately supplied export; absence of that source blocks only the real-data receipt, not this contract verification.
