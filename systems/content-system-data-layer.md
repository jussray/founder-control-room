# Content system data layer (FCR hub)

Migration: `supabase/migrations/20261104022801_content_system_data_layer.sql`
Governance: Founder Content System (installed 2026-10-23) — approval binds to
the exact content hash, expires in 24 hours, no approval means no publication,
a native receipt is required before anything is called published, and every
receipt chain entry names its predecessor. Nothing in the chain is deleted,
only superseded.

This layer is the Supabase home of the live editorial queue that today lives
in `posting-queue.json` (social-accounts-and-posting-cadence goal workspace).
Source-only until an explicitly authorized database apply.

## Mapping: posting-queue.json -> tables

| Queue file | Table | Notes |
| --- | --- | --- |
| `items[].id` (e.g. `B1-01`) | `content_queue.id` | Text PK, batch-prefixed as in the file. |
| project (from fingerprint) | `content_queue.project` | The featured project, distinct from the posting account. |
| `items[].account` / `account_id` | `content_queue.account` / `account_id` | Business accounts only; personal accounts stay excluded by queue governance. |
| `items[].caption` | `content_queue.caption` | |
| `items[].media_path` | `content_queue.media_path` | |
| media file bytes (hashed into `content_hash` today) | `content_queue.media_hash` | **New, distinct column** — see the unseen-media guard below. |
| media review event (new in DB) | `content_queue.media_reviewed_at` | Set only when the founder has actually seen the exact media. |
| `items[].cta_url` | `content_queue.cta_url` | |
| `items[].fingerprint` | `content_queue.fingerprint` | PROJECT + PROOF SUBJECT + ANGLE + CTA. |
| `items[].content_hash` | `content_queue.content_hash` | SHA-256 of caption + media bytes + CTA link. |
| `items[].seo_keywords` | `content_queue.seo_keywords` | jsonb array. |
| `items[].geo_statement` / `aeo_question` | same-named columns | Post standard (Ray, 2026-11-03). |
| `items[].status` | `content_queue.status` | Same enum: DRAFT / APPROVED / HELD / WITHDRAWN / PUBLISHED / BLOCKED. |
| `items[].approved_at` / `approved_by` / `withdrawn_at` | same-named columns | Editorial mirror fields (see authority note). |
| approval expiry (governance: 24h) | `content_queue.approval_expires_at` | Enforced by check constraint on APPROVED rows. |
| `publication-receipts.md` entries | `publication_receipts` | One row per native publication, successor-chained. |
| daily watch per-post pulls | `post_metrics` | Wide snapshot per receipt per measurement window. |

## Authority note — why there is no `content_approvals` table

FCR already carries content approvals, authoritatively:
`public.founder_content_approvals` (migration `20260819073000`) is a one-shot
approval ledger — proposal hash, public payload hash, authorization hash,
expiry, revocation, one-time consumption — and provider execution must claim
the exact stored row before mutating anything. A second approvals table would
fork that authority and invite a caller to treat an editorial record as
execution authority, which the existing schema explicitly forbids.

So this layer narrows on purpose:

- Editorial approval (the founder's in-chat tap on an exact queue item) is
  recorded on `content_queue` itself: `approved_at`, `approved_by`,
  `approval_expires_at`, `withdrawn_at`, `status_note`.
- When the trusted FCR backend issues the authoritative approval for a queue
  item, the row links it: `content_queue.founder_approval_id ->
  founder_content_approvals(approval_id)`.
- The generic `approvals` table (init schema) is mission/change-proposal
  scope (create_branch / deploy / rollback) and is not used for content.

Publication lifecycle truth likewise stays in
`public.founder_content_posts`; `publication_receipts.founder_post_id` links
a queue-lane receipt to the lifecycle post when the item is promoted.
Per-post metric *observations* in normalized form stay in
`public.founder_content_metric_observations`; `post_metrics` holds the wide
snapshots (reach / views / shares / saves / bio taps) that the social watch
lane collects and that the observations table's metric family does not cover.

## Receipt-chain rule

- A queue item is **published only when a receipt exists** in
  `publication_receipts` — never on a provider acknowledgement alone.
- Receipts are append-only (update/delete revoked even for `service_role`).
  A correction or re-publication is a **new** receipt whose
  `predecessor_receipt_id` names the receipt it supersedes.
- Exactly one chain head per queue item (partial unique index on
  `predecessor_receipt_id is null`), and `(platform, account, native_post_id)`
  is unique — the same native post can never be receipted twice.

## The unseen-media guard (2026-11-03 failure class)

Failure: a batch approval was granted on captions while the founder had never
seen the media; the first graphic was rejected on sight and the batch's
remaining graphics had to be held. The schema makes that state
unrepresentable:

1. `media_hash` is a column **distinct** from `content_hash` — the media is
   bound separately, so approving text can never implicitly approve media.
2. Check constraint `content_queue_approval_requires_seen_media`: a row with
   `status = 'APPROVED'` must have `approved_at`, `approved_by`, a non-null
   `media_hash`, a non-null `media_reviewed_at`, and a live
   `approval_expires_at`. No seen-media record, no APPROVED state — at the
   data level, not by convention.
3. Trigger `guard_content_queue_approval_binding`: changing `caption`,
   `cta_url`, `content_hash`, `media_hash`, or `media_path` on an APPROVED
   row demotes it to HELD and clears the approval fields in the same write;
   any media change also voids `media_reviewed_at`. Re-approval requires a
   fresh media review of the exact new media.

## Metrics rule

`post_metrics` metric columns are nullable with **no defaults**: an
unmeasured metric is NULL (UNKNOWN), never zero-filled. A snapshot with
`evidence_state = 'UNKNOWN_NO_EVIDENCE'` must have all metrics NULL
(check constraint); `PARTIAL` names a snapshot where only some metrics were
exposed by the provider. Windows follow the Founder Content System
measurement rule: `24h`, `72h`, `7d` (plus `lifetime` / `rolling_7d` for
account-level watch snapshots).

## Access

All three tables: RLS enabled, single `*_service_role_only` policy
(`auth.role() = 'service_role'`), all grants revoked from `public`, `anon`,
and `authenticated` — matching the repo's existing founder-content migration
pattern. `content_queue` grants select/insert/update/delete to
`service_role`; the two evidence tables grant select/insert only.
