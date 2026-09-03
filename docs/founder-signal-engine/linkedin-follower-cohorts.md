# LinkedIn follower cohorts

Status: source-implemented on the existing Founder Signal Engine carrier; provider acquisition remains a separate authority boundary.

Founder Control Room may learn from who follows Juss, but follower identity is observation-only evidence. It cannot approve, publish, schedule, merge, deploy, renew truth, widen authority, or become a substitute for product/runtime evidence.

## Goal

Turn a follower count into a durable cohort memory without publishing Juss's relationship graph.

```text
authorized private LinkedIn follower observation
-> stable member identity
-> SHA-256 follower fingerprint
-> private classification
-> NEW / RETAINED / LOST / UNKNOWN reconciliation
-> redacted cohort receipt
-> Founder Signal Engine strategy input
```

## Implementation

`scripts/linkedin_follower_cohort.py` implements `linkedin-follower-cohort@v1`.

Input contract: `linkedin-follower-snapshot@v1`.

Each follower requires a stable LinkedIn profile URL or public identifier. A display name by itself is not a stable identity and is counted as unresolved rather than guessed.

The follower fingerprint is the first 24 hexadecimal characters of SHA-256 over:

```text
linkedin-follower|<normalized-linkedin-profile-identity>
```

Tracking parameters and fragments are removed from profile URLs before hashing.

## Privacy boundary

The public/redacted cohort receipt never contains:

- follower names;
- LinkedIn profile URLs;
- titles;
- company names;
- raw source evidence.

Those values may exist only in the founder-authenticated/private source boundary. The repository may contain the deterministic engine, tests, schemas, and redacted receipts, but it must not become a public follower directory.

The receipt may retain coarse strategy metadata such as category, seniority band, relationship signal, project relevance, high-value flag, and priority score because those are used as bounded content-strategy observations. They remain non-authorizing.

## Reconciliation truth

A current follower can be classified as `LOST` only when the current observation explicitly declares `COMPLETE_VISIBLE_LIST`.

For `PARTIAL_VISIBLE_LIST` observations, identities missing from the current view are classified as `unknown_missing`, never `lost`.

This prevents screenshots, pagination, UI caps, partial exports, or incomplete browser observations from manufacturing follower churn.

## Autonomous trigger

The cohort engine is designed to be event-driven.

An authorized private adapter may emit `linkedin-follower-snapshot-ready` after it has produced a complete or explicitly partial snapshot. The repository workflow downloads the private snapshot at runtime, reconciles it against the most recent redacted receipt when available, and stores only a redacted Actions artifact.

The event payload must carry a protected snapshot reference, not raw follower identities. Any snapshot URL must be masked in workflow logs. If an authorized machine-readable follower source is not available, the acquisition stage is `BLOCKED_SOURCE`; the system must not scrape around provider controls, infer identities from demographics, or fabricate a cohort.

Provider acquisition and cohort analysis are intentionally separate:

```text
LinkedIn/private source authority
  -> acquisition adapter
  -> private snapshot
  -> repository_dispatch event
  -> deterministic cohort engine
  -> redacted receipt
```

The engine can therefore run autonomously once legitimate source evidence exists without giving the analytics lane authority over LinkedIn or publication.

## Run locally

```bash
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
