# LinkedIn follower cohorts

Status: source-implemented on the existing Founder Signal Engine carrier; provider acquisition remains a separate authority boundary.

Founder Control Room may learn from who follows Juss, but follower identity is observation-only evidence. It cannot approve, publish, schedule, merge, deploy, renew truth, widen authority, or become a substitute for product/runtime evidence.

## Goal

Turn a follower count into durable cohort memory without publishing Juss's relationship graph.

```text
authorized private LinkedIn follower observation
-> stable member identity
-> private-key HMAC member id
-> allowlisted coarse classification
-> NEW / RETAINED / LOST / BASELINE-UNKNOWN reconciliation
-> redacted cohort receipt
-> Founder Signal Engine strategy input
```

## Implementation

`scripts/linkedin_follower_cohort.py` implements `linkedin-follower-cohort@v2`.

Input contract: `linkedin-follower-snapshot@v1`.

Each follower requires a stable LinkedIn profile URL or public identifier. A display name by itself is not a stable identity and is counted as unresolved rather than guessed.

Public cohort member IDs are derived with HMAC-SHA256 over the normalized LinkedIn identity using private runtime key material. The public artifact never contains the key and an observer cannot reproduce a member ID from a guessed public profile URL without that private key.

The current workflow derives the domain-separated cohort identity from the private `LINKEDIN_FOLLOWER_SNAPSHOT_TOKEN`, which is already required to access the private snapshot source. The token must contain at least 32 characters and is masked in workflow logs. Rotating that token intentionally resets the privacy identity epoch; a legacy unkeyed v1 receipt is treated as a fresh privacy baseline rather than cross-correlated.

Tracking parameters and fragments are removed from profile URLs before keyed identity derivation.

## Privacy boundary

The public/redacted cohort receipt never contains:

- follower names;
- LinkedIn profile URLs;
- titles;
- company names;
- raw source evidence;
- private HMAC key material.

Those values may exist only in the founder-authenticated/private source boundary. The repository may contain the deterministic engine, tests, schemas, and redacted receipts, but it must not become a public follower directory.

Persisted strategy metadata is restricted to explicit enums for category, seniority, relationship signal, and project relevance plus a boolean high-value flag and derived priority score. Free-form values fail closed rather than being copied into a supposedly redacted artifact.

## Reconciliation truth

Follower reconciliation is intentionally conservative.

- The first compatible v2 capture is a baseline. Existing visible followers are `baseline_or_unknown_added`, not `NEW`.
- When the previous capture was partial, newly visible identities remain `baseline_or_unknown_added`; partial visibility does not prove acquisition.
- `NEW` requires a previous `COMPLETE_VISIBLE_LIST` that proves the keyed identity was absent.
- `LOST` requires a current `COMPLETE_VISIBLE_LIST` that proves a previously observed keyed identity is now absent.
- Missing identities under a current partial capture are `unknown_missing`, never `LOST`.
- Every successor snapshot must have an `observed_at` timestamp strictly later than the compatible previous receipt. Delayed/replayed snapshots fail closed instead of replacing newer cohort truth.

This prevents screenshots, pagination, UI caps, partial exports, replayed evidence, or incomplete browser observations from manufacturing follower acquisition or churn.

## Autonomous trigger

The cohort engine is event-driven.

An authorized private adapter may emit `linkedin-follower-snapshot-ready` after it has produced a complete or explicitly partial snapshot. The repository workflow downloads the private snapshot at runtime, reconciles it against the most recent redacted receipt when available, and stores only a redacted Actions artifact.

The event payload must carry a protected snapshot reference, not raw follower identities. Snapshot URL and token are masked in workflow logs. If an authorized machine-readable follower source or the private keyed-identity material is unavailable, the acquisition/reconciliation stage fails closed as `BLOCKED_SOURCE` or `BLOCKED_PRIVACY_KEY`; the system must not scrape around provider controls, infer identities from demographics, downgrade to an unkeyed public hash, or fabricate a cohort.

Provider acquisition and cohort analysis are intentionally separate:

```text
LinkedIn/private source authority
  -> authenticated acquisition adapter
  -> private snapshot
  -> repository_dispatch event
  -> keyed deterministic cohort engine
  -> redacted receipt
```

The engine can therefore run autonomously once legitimate source evidence exists without giving the analytics lane authority over LinkedIn or publication.

## Run locally

Local/manual execution requires private key material in the environment. Do not put the key on a command line or commit it to source.

```bash
export LINKEDIN_FOLLOWER_ID_HMAC_KEY='<private 32+ byte value>'
python3 scripts/linkedin_follower_cohort.py follower-snapshot.json \
  --previous-receipt previous-redacted-receipt.json \
  --output follower-cohort-receipt.json
```

Focused verification:

```bash
python3 -m unittest scripts/test_linkedin_follower_cohort.py
```

## Strategy use

Follower cohort observations can inform audience fit, founder/builder/recruiter/investor concentration, project relevance, retention, and which content lanes attract qualified people. They do not prove that a specific post caused a follow unless a separate provider-observed causal signal exists.
