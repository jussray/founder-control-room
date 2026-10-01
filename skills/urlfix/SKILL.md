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

URLFix observes, diagnoses, and verifies. Goalfix owns source-repair discipline. FCR owns project identity, authority, runtime truth, and evidence trust. Playwright supplies browser evidence.

## Governing axiom

URLFix may advance a defect only to the highest proof state actually observed.

`LIVE_BROWSER_PROVEN` requires the same meaningful behavioral witness that exposed the defect to fail on the real live baseline and pass on the identified repaired live runtime, using real dependencies and independently verified evidence artifacts.

A stable URL is a locator, not runtime identity. Source green, local green, preview green, provider acceptance, or a page merely loading are not live repair proof.

## Authority model

Resolve project authority from the existing FCR active portfolio registry. Do not create a parallel project registry and do not infer repository ownership from a hostname.

Keep these truths separate:

- source ownership;
- URL/origin ownership;
- bounded repair authority;
- runtime identity;
- deploy authority;
- consequential external-effect authority.

A URLFix payload cannot grant itself authority. Ownership and repair authority references become usable only when FCR independently recognizes them in the trusted evidence context.

External, ambiguous, continuity-only, quarantined, unverified-origin, or otherwise non-authority targets remain observation-only.

## Invocation repair scope

For a confirmed-owned active project, a trusted founder/operator URLFix invocation may authorize the bounded repair loop only when FCR produces or recognizes the matching repair-authority receipt.

That bounded scope may cover:

- inspect the public/live path;
- create an evidence-backed issue ledger;
- inspect the canonical owned repository;
- modify a compatible current authorized repair carrier;
- make the smallest reversible P0/P1/P2 source fix;
- add focused regression proof;
- run local/preview browser verification.

It does not itself authorize merge, production deployment, database/provider mutation, payment, publication, messaging, deletion, credential changes, or authority widening.

## Strategic cognition, compiled

Apply five gates rather than reciting a prompt stack:

1. **Blind spot:** What could make the current failure model wrong?
2. **Value:** Which broken path matters most to the product/user?
3. **Cause:** What falsifiable root cause best explains the evidence?
4. **Simplicity:** What is the smallest reversible correction?
5. **Proof:** What exact observation must change before state advances?

Execution shorthand: `SEE -> PRIORITIZE -> ATTACK -> PIVOT -> SIMPLIFY -> PROVE`.

## URL and ownership resolution

Record original URL, final URL, redirect chain, host/origin, path, query/fragment presence, and capture timestamp.

Both the original and final origin must be inside the FCR-confirmed owned-origin set before source mutation is considered. A redirect that leaves that set downgrades the run to observation-only until separately resolved.

Hostname text alone is never authority.

Ownership states:

- `OWNED_CONFIRMED`
- `OWNED_AMBIGUOUS`
- `EXTERNAL`
- `UNKNOWN`
- `BLOCKED`

## Browser and network safety

Use Playwright Chromium against the requested public URL only after target validation.

The browser runner must fail closed against private/local/link-local/metadata destinations on the initial URL, redirects, frames, and subrequests. Do not rely only on the hostname string. Resolve addresses and reject private/reserved targets before allowing requests where the runner can observe DNS.

Do not bypass authentication, network controls, robots/policy gates, or provider security boundaries merely to obtain a screenshot.

Minimum viewports:

- desktop `1440x900`
- mobile `390x844`

Prefer declared critical flows, then existing Playwright flows, then documented journeys, then the smallest safe public path visible from the UI.

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

## Issue state model

Primary evidence progression:

`OBSERVED -> REPRODUCED -> CAUSE_BOUNDED -> PATCHED -> SOURCE_PROVEN`

Browser proof states are conditional evidence levels, not mandatory hops:

- `LOCAL_BROWSER_PROVEN`
- `PREVIEW_BROWSER_PROVEN` when a meaningful preview exists
- `LIVE_BROWSER_PROVEN`

Do not claim a higher state without its required evidence. Preview may be inapplicable; its absence does not authorize skipping live requirements.

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

## Same behavioral witness law

The stable witness fingerprint covers behavior only:

- route;
- viewport;
- preconditions;
- ordered browser actions;
- expected observable result.

Environment and evidence mode are execution metadata, not part of the behavioral fingerprint. This allows the same behavior to be replayed from local to preview to live without pretending those environments are equivalent.

Before and after executions must have different run IDs and the same witness fingerprint.

## Evidence modes

Every browser execution records one mode:

- `REAL`
- `INTERCEPTED`
- `MOCKED`
- `FIXTURE`

Fixture/mocked/intercepted evidence may establish local interaction or branching behavior. It may not establish preview or live provider/API/data outcomes.

`PREVIEW_BROWSER_PROVEN` requires real preview dependencies.

`LIVE_BROWSER_PROVEN` requires all of:

- real live before execution;
- real live after execution;
- same behavioral witness fingerprint;
- same live origin and route;
- failing before observable result;
- expected after observable result;
- independently verified before/after trace artifacts;
- known repaired runtime identity;
- independently verified runtime-identity evidence reference.

A caller-supplied artifact ID or runtime string is not proof by itself.

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

Provide Goalfix with issue ID, severity, exact behavioral witness, before evidence, failure plane, root-cause hypothesis, canonical repository/branch/SHA facts, compatible carrier, authority receipt reference, external-effect boundary, and required same-witness retest.

Expect root cause, smallest reversible patch, files changed, source checks, focused regression test, local/preview result, candidate runtime identity when available, residual risk, and rollback.

## Carrier policy

Do not create or contaminate a PR merely because URLFix found a problem.

Reuse an existing carrier only when all are true:

- same canonical repository;
- same root cause or repair objective;
- carrier is current enough to remain valid;
- added work keeps scope coherent;
- repository/founder authority permits the edit.

Otherwise stop at `BLOCKED_CARRIER_SCOPE`. A separately authorized branch may preserve source work without implying a new PR or merge authority.

## Consequential-action boundary

Stop before account creation, payments, subscriptions, publication, deletion, messaging, invitations, role changes, production configuration, credential changes, or other real external effects unless separately authorized.

Use sandbox/test identities or boundary proof where available. Simulated behavior stays non-live evidence.

## Evidence hygiene

Artifacts default outside the product repository and outside public git history.

Never persist passwords, cookies, Authorization headers, API keys, access/refresh tokens, secret form values, raw sensitive request bodies, or unnecessary teen/family/private content.

Do not publish arbitrary screenshots, traces, DOM/body text, or network logs into a public repository or public tag. Redact, omit, or use an approved access-controlled evidence store when capture could expose sensitive or identifying material.

## Verification ladder

1. source checks from Goalfix;
2. same-witness local browser proof;
3. same-witness preview browser proof when meaningful;
4. candidate runtime/deployment identity;
5. real live baseline + real live repaired same-witness recheck;
6. before/after comparison and regression scan.

The exact defect witness must pass. A generic page-load check is not a substitute.

## Stop conditions

Stop when material P0/P1 issues and selected bounded P2 issues are proven at the highest reachable state or explicitly blocked, and the remainder is P3, duplicate, speculative, or not reproducible.

Also stop when the next move requires missing authority, credentials, provider repair, incompatible carrier scope, deployment access, or consequential-action authorization.

## Final receipt

Return:

- tested/final URL and ownership class;
- project slug, canonical repo, branch/SHA, runtime identity when observed;
- critical paths/viewports tested;
- issue ledger with failure plane and proof state;
- before/after behavioral fingerprint plus distinct run IDs;
- evidence mode and independently verified artifact refs;
- Goalfix patch/carrier refs when applicable;
- highest proof state actually observed;
- blockers, residual risk, and untested consequential flows.

No fake green. No authority inflation. No live claim from mock evidence.
