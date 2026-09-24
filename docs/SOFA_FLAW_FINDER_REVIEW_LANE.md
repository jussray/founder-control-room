# SOFA Flaw Finder External Review Lane

**Status:** bounded external-review contract, not yet runtime-integrated  
**Provider:** SOFA  
**Agent:** `Flaw Finder`  
**SOFA permission:** Contributor  
**SOFA publication policy:** Create drafts directly  

## Purpose

Use SOFA's `Flaw Finder` as an adversarial external reviewer that can produce evidence-bound draft observations for Founder Control Room without silently becoming a trusted FCR peer operator, independent-review witness, publisher, merger, deployer, or provider authority.

The lane exists to find flaws in the target and in the reviewer's own reasoning.

## Current authority boundary

A SOFA Flaw Finder observation is:

- proposal-only;
- draft-only;
- bound to one repository, branch, exact head SHA, source reference, and source fingerprint;
- non-authorizing;
- unable to satisfy FCR independent-review policy by itself;
- unable to promote itself into `src/lib/agentRegistry.ts`.

It carries this authority ceiling:

```json
{
  "externalWrite": false,
  "merge": false,
  "deploy": false,
  "publish": false,
  "providerMutation": false,
  "registryPromotion": false
}
```

SOFA `Contributor` capability and `Create drafts directly` are external product permissions. They do not become FCR authority.

## Attack flow

Every substantive Flaw Finder observation must run all of these attacks before FCR may treat it as a complete external observation:

1. baseline attack;
2. assumption attack;
3. contradiction attack;
4. inversion attack;
5. failure-path attack;
6. authority attack;
7. evidence attack;
8. freshness attack;
9. scope attack;
10. exploit attack;
11. outcome attack;
12. self-attack;
13. counterexample attack;
14. steelman attack;
15. second-pass attack against the proposed fix.

The self-attack is mandatory. A reviewer that only attacks the target can manufacture confidence from its own blind spots.

## Truth classification

Findings use the existing Founder Control Room truth vocabulary:

- `VERIFIED`
- `INFERRED`
- `UNKNOWN`
- `BLOCKED`

Each finding also carries severity `P0` through `P3`, an explicit true baseline, evidence references, contradictions, recommended correction, rollback, and next proof gate.

## Receipt contract

The executable source contract is `src/review/externalFlawFinderObservation.ts`.

Contract id:

```text
juss/external-flaw-finder-observation@v1
```

The observation fingerprint binds:

- provider and reviewer identity;
- repository;
- branch;
- exact head SHA;
- external source reference;
- source fingerprint;
- observation and expiry times;
- attacks actually run;
- ordered findings and evidence;
- draft/proposal-only state;
- the zero-authority ceiling.

Tampering with the source identity or finding content invalidates the corresponding fingerprint/hash.

## What this does not prove

This contract does **not** prove that:

- FCR can currently call SOFA;
- SOFA can currently call FCR;
- a specific SOFA account or agent identity is authenticated;
- an observation came from the configured Flaw Finder rather than copied text;
- SOFA runtime output is current or provider-attested;
- a SOFA finding satisfies FCR's independent-review gate;
- a SOFA draft was published;
- a recommended fix was implemented or verified.

Until provider/runtime evidence exists, FCR must preserve the distinction between a well-formed observation and an authenticated SOFA round trip.

## Promotion gate

Do not add `Flaw Finder` to the canonical FCR operator registry merely because the SOFA agent exists.

Promotion requires all of the following on one exact FCR head:

1. documented SOFA API or connector capability for the needed operation;
2. authenticated dispatch to the exact `Flaw Finder` agent;
3. provider evidence proving which SOFA agent/runtime answered;
4. response binding back to the exact request/source fingerprint;
5. FCR validation of the external observation contract;
6. no authority widening beyond the founder-approved lane;
7. targeted unit/integration proof;
8. real Playwright proof from the FCR surface for the complete founder-visible round trip;
9. continuity receipt with rollback and unresolved risks.

Only after those gates pass should a separate founder decision consider canonical registry promotion.

## Failure behavior

Fail closed when:

- exact repository, branch, or head SHA is missing;
- the source fingerprint does not match the source identity;
- the observation is stale;
- any required attack flow, especially `self_attack`, is missing;
- evidence is malformed;
- the observation tries to carry write, merge, deploy, publish, provider-mutation, or registry-promotion authority;
- the observation claims it already counts as independent review;
- the final observation hash does not match the content.

## Verification

The focused unit contract lives in:

```text
src/review/externalFlawFinderObservation.test.ts
```

Repository policy still requires the normal proof floor before merge. Because no FCR UI/runtime adapter exists yet, Playwright round-trip proof is currently a **promotion gate**, not evidence that exists today.
