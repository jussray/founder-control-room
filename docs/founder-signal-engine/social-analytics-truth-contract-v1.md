# Social Analytics Truth Contract v1

## Purpose

Extend the existing Founder Content Value Attribution flow without creating a second analytics system.

FCR remains the evidence plane. Social observations must be bound to the exact account, provider, content identity when available, observation window, metric definition, and evidence reference before they can influence a recommendation.

## Required observation identity

Every material social-performance claim must bind:

- platform;
- account identity;
- provider/source;
- observed-at timestamp;
- time-window kind;
- explicit window start and end when available;
- content/post identity when the claim is post-specific;
- metric name and metric definition;
- evidence reference;
- truth state: `VERIFIED`, `OBSERVED`, `INFERRED`, `UNKNOWN`, or `BLOCKED`.

Supported window kinds include `post_lifetime`, `rolling_7d`, `rolling_30d`, `rolling_90d`, `calendar_month`, and `custom_range`.

A rolling window must never be relabeled as a calendar month. A short follower delta must never be promoted into a full-month change without exact period evidence.

## Metric separation

Keep provider-native metric semantics intact.

Do not silently substitute:

- views for impressions;
- reach for views;
- likes + comments for total engagement;
- account-level totals for post-level metrics;
- post-level metrics for account-level totals;
- rolling-window totals for calendar-month totals;
- follower delta over a partial range for monthly follower growth.

Missing metrics remain `UNKNOWN`. An explicitly observed zero remains zero.

## Cross-account boundary

Account observations are independent evidence subjects.

Do not aggregate multiple accounts into a whole-presence claim unless the request explicitly asks for aggregation and the aggregation rule is recorded. A value observed on one account cannot be used as evidence for another account.

For portfolio rollups, retain the contributing account ids, date windows, and metric definitions. Never use the smallest or largest account as a proxy for the portfolio.

## Content-experiment binding

A content experiment may compare a control and challenger, but the comparison must bind the same primary success metric and record meaningful differences such as:

- format;
- content angle;
- opening/hook class;
- publishing time;
- audience/account;
- duration when video is involved.

Candidate metrics include views, reach, likes, comments, shares, saves, profile actions, follower change, proof-link clicks, qualified conversations, and downstream conversion metrics already supported by the Founder Content Value Attribution contract.

Rates may be derived only when the denominator is observed for the same subject and window. Example: `shares / reach` requires both shares and reach from the same post/account scope and compatible time window.

## Decision ceiling

Social analytics is observation and learning only. It cannot authorize publishing, scheduling, copy mutation, spend, outreach, merge, deploy, or removal of an existing product/content gate.

A stronger observed signal can justify a bounded test recommendation. It cannot become a winner merely because it outperformed on one vanity metric.

## Current experiment rule

For the current Instagram correction, personal/family video is the observed control signal. The preferred challenger is a human-first personal/founder hybrid video that carries founder meaning and, when appropriate, a real proof artifact.

Founder-only content remains a hypothesis, not the declared winner.

JBH product publishing remains subject to its existing image-quality and cadence gates. Social analytics cannot override those gates.

## Cross-system responsibilities

- **FCR:** canonical evidence subject, metric/window/account binding, evidence references, truth state, and experiment receipt.
- **Chief:** bounded decision support, control/challenger comparison, falsifier, next gate, and keep/tune/kill/unresolved recommendation.
- **Sol:** continuity fingerprint/cookie for the exact experiment and observation state; stale-state invalidation across sessions/runs.
- **PromptOS:** prompt/routing constraints that preserve evidence wording and prevent invented metric weights, scope drift, or unsupported certainty.

No system may copy another system's authority. FCR evidence does not grant Chief action authority; Chief reasoning does not grant PromptOS publishing authority; Sol continuity does not create truth; PromptOS generation does not create evidence.
