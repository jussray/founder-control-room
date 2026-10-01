---
name: urlfix
version: 0.2.0
status: candidate
scope: portfolio
owner: Juss
aliases:
  - /urlfix
category: engineering
requires:
  - playwright
  - goalfix
  - fcr-portfolio-registry
---

# URLFix

## Mission

Turn a live URL into a truthful repair loop:

`URL -> resolve -> browser baseline -> issue ledger -> failure plane -> causal hypothesis -> goalfix -> same witness -> runtime identity -> live recheck`

URLFix observes, diagnoses, and verifies. Goalfix owns source-repair discipline. FCR owns project identity, authority, and proof boundaries. Playwright supplies browser evidence.

## Governing axiom

URLFix may advance a defect only to the highest proof state actually observed.

`LIVE_BROWSER_PROVEN` requires the same meaningful witness specification that exposed the defect to pass against the identified repaired live runtime using real, non-mocked dependencies.

A stable URL is a locator, not runtime identity. Source green, local green, preview green, provider acceptance, or a page merely loading are not live repair proof.

## Authority model

Resolve project authority from the existing FCR active portfolio registry. Do not create a parallel project registry and do not infer repository ownership from a hostname.

Keep these truths separate:

- source ownership
- repair scope authority
- runtime identity
- deploy authority
- consequential external-effect authority

A confirmed active FCR project may have bounded source-repair authority while production runtime identity remains unknown. In that case source work may continue, but the highest legal claim is `PATCHED_NOT_LIVE` until live identity and browser proof exist.

External, ambiguous, continuity-only, quarantined, or otherwise non-authority URLs remain observation-only.

## Invocation repair scope

For a confirmed-owned active project, a trusted founder/operator URLFix invocation may authorize the bounded repair loop:

- inspect the public/live path;
- create an evidence-backed issue ledger;
- inspect the canonical owned repository;
- modify a compatible current authorized repair carrier;
- make the smallest reversible P0/P1/P2 source fix;
- add focused regression proof;
- run local/preview browser verification.

It does not itself authorize merge, production deployment, database/provider mutation, payment, publication, messaging, deletion, credential changes, or authority widening.

## Strategic cognition, compiled

Do not recite a large prompt stack at every step. Apply five gates:

1. **Blind spot:** What could make the current failure model wrong?
2. **Value:** Which broken path matters most to the product/user?
3. **Cause:** What falsifiable root cause best explains the evidence?
4. **Simplicity:** What is the smallest reversible correction?
5. **Proof:** What exact observation must change before state advances?

Execution shorthand: `SEE -> PRIORITIZE -> ATTACK -> PIVOT -> SIMPLIFY -> PROVE`.

## Resolution contract

Normalize the input URL and record original URL, final URL, redirect chain, host, path, query/fragment presence, and capture timestamp.

Resolve a URL binding against the active FCR project registry. A binding must name the project slug and exact canonical repository and must carry ownership evidence. Hostname text alone is never authority.

Classify ownership as:

- `OWNED_CONFIRMED`
- `OWNED_AMBIGUOUS`
- `EXTERNAL`
- `UNKNOWN`
- `BLOCKED`

Only `OWNED_CONFIRMED` plus bounded repair scope may mutate source.

## Browser baseline

Use Playwright Chromium against the original URL. Minimum viewports:

- desktop `1440x900`
- mobile `390x844`

Prefer the product's declared critical flows, then existing Playwright flows, then documented journeys, then the smallest safe public path visible from the UI.

Inspect reachability, redirects, console/page errors, failed requests, broken assets, overflow/clipping, primary controls, forms, loading/error/empty states, obvious accessibility defects, layout shift, slow/failing API calls, and user-visible JavaScript failure.

Never improvise into a consequential action.

## Failure-plane contract

Classify each reproduced defect before editing:

- `BROWSER`
- `APPLICATION`
- `API`
- `DATABASE`
- `AUTH`
- `CONFIG_SECRET`
- `DEPLOYMENT`
- `DNS`
- `CDN_EDGE`
- `THIRD_PARTY_PROVIDER`
- `UNKNOWN`

Fix the earliest causal plane supported by evidence, not merely the nearest visible symptom.

## Issue state machine

Primary progression:

`OBSERVED -> REPRODUCED -> CAUSE_BOUNDED -> PATCHED -> SOURCE_PROVEN -> LOCAL_BROWSER_PROVEN -> PREVIEW_BROWSER_PROVEN -> LIVE_BROWSER_PROVEN`

Side/terminal states:

- `NOT_REPRODUCED`
- `DUPLICATE`
- `P3_LOGGED`
- `OBSERVATION_ONLY`
- `BLOCKED_AUTHORITY`
- `BLOCKED_PROVIDER`
- `BLOCKED_MAPPING`
- `BLOCKED_CARRIER_SCOPE`
- `BLOCKED_CONSEQUENTIAL_ACTION`
- `PATCHED_NOT_LIVE`
- `ROLLBACK_REQUIRED`

No wording may skip a proof state.

## Witness law

The witness specification, not the execution ID, is stable.

Fingerprint these fields:

- route;
- viewport;
- preconditions;
- ordered browser actions;
- expected observable result;
- dependency mode.

Before and after executions must have different run IDs and the same witness-spec fingerprint.

A valid repair proof needs a failing before observation, a passing after observation, and before/after trace artifact references. Screenshots should be retained when safe and useful.

## Real vs simulated evidence

Every browser run records an evidence mode:

- `REAL`
- `INTERCEPTED`
- `MOCKED`
- `FIXTURE`

Intercepted, mocked, and fixture evidence may prove rendering, local branching, browser interaction, or test behavior. They may never prove production API behavior, provider success, live data correctness, external outcomes, or `LIVE_BROWSER_PROVEN`.

`LIVE_BROWSER_PROVEN` additionally requires `target=LIVE` and a known repaired runtime identity.

## Reproduction count

Default to two consistent reproductions when useful.

One strong reproduction is sufficient when the failure is deterministic with high-quality browser/network evidence, repeating it risks an external effect, or a P0 outage makes repetition diagnostically pointless.

Use more runs for suspected race, timing, or flaky behavior.

## Source mapping

After reproduction:

1. identify route and action boundary;
2. correlate browser evidence with router/component/API/backend/config/provider evidence;
3. review relevant recent diffs or deployment movement;
4. form one falsifiable root-cause hypothesis;
5. attack that hypothesis before editing;
6. pivot failure planes when evidence rejects it;
7. delegate one bounded cause to Goalfix.

Mapping disagreement must return evidence. Do not patch on vibes.

## Goalfix handoff

Provide Goalfix with issue ID, severity, exact witness spec, before evidence, failure plane, root-cause hypothesis, repository/branch/SHA facts, repair carrier, authority boundary, and required same-witness retest.

Expect root cause, smallest reversible patch, files changed, source checks, focused regression test, local/preview result, candidate runtime identity when available, residual risk, and rollback.

## Carrier reuse

Do not create a new PR merely because URLFix found a problem.

Reuse an existing carrier only when all are true:

- same canonical repository;
- same root cause or repair objective;
- carrier is current enough to remain valid;
- added work keeps scope coherent;
- repository/founder authority permits the edit.

Otherwise stop at `BLOCKED_CARRIER_SCOPE` rather than contaminating unrelated work.

## Consequential-action boundary

Stop before account creation, payments, subscriptions, publication, deletion, messaging, invitations, role changes, production configuration, credential changes, or other real external effects unless separately authorized.

Use sandbox/test identities or boundary proof where available. Mocked/intercepted behavior stays non-live evidence.

## Evidence hygiene

Do not retain secrets or unnecessary personal data in screenshots, traces, console/network logs, or receipts.

Never persist passwords, cookies, Authorization headers, API keys, access/refresh tokens, secret form values, raw sensitive request bodies, or unnecessary teen/family/private content. Redact or omit evidence when capture would expose it.

Artifacts should default outside the product repository. Repository-stored artifacts require an explicit bounded path and ignore rules.

## Verification ladder

1. source checks from Goalfix;
2. same-witness local browser proof;
3. same-witness preview browser proof when applicable;
4. candidate runtime/deployment identity;
5. same-witness recheck against the original live URL;
6. before/after comparison and regression scan.

The exact defect witness must pass. A generic page-load check is not a substitute.

## Stop conditions

Stop when all material P0/P1 issues and selected bounded P2 issues are either proven at the highest reachable state or explicitly blocked, and the remainder is P3, duplicate, speculative, or not reproducible.

Also stop when the next move requires missing authority, credentials, provider repair, incompatible carrier scope, deployment access, or consequential-action authorization.

## Final receipt

Return:

- tested/final URL and ownership class;
- project slug, canonical repo, branch/SHA, runtime identity when observed;
- critical paths/viewports tested;
- issue ledger with failure plane and proof state;
- before/after witness fingerprint plus distinct run IDs;
- evidence mode and artifact refs;
- Goalfix patch/carrier refs when applicable;
- highest proof state actually observed;
- blockers, residual risk, and untested consequential flows.

No fake green. No authority inflation. No live claim from mock evidence.
