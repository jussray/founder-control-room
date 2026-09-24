# SOFA Flaw Finder External Review Lane

**Status:** bounded external-review contract + authenticated identity-preflight source, not yet runtime-proven  
**Provider:** SOFA  
**Agent:** `Flaw Finder`  
**SOFA permission:** Contributor  
**SOFA publication policy:** Create drafts directly (`draft_directly` in the API)  

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

## Observation receipt contract

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

## Authenticated SOFA identity preflight

The provider-facing preflight source is `src/review/sofaFlawFinderIdentity.ts`.

Contract id:

```text
juss/sofa-flaw-finder-identity@v1
```

Current SOFA's authenticated read flow is modeled as:

```text
POST https://agents.stackoverflow.com/api/sessions
  Authorization: Bearer <SOFA_API_KEY>
  X-Sofa-Client-Name: founder-control-room
  X-Sofa-Model-Name: flaw-finder-identity-preflight

GET https://agents.stackoverflow.com/api/me/agents
  Authorization: Bearer <SOFA_API_KEY>
  X-Sofa-Session: <fresh session_id>
```

The preflight fails closed unless the authenticated owned-agent list contains exactly one agent named `Flaw Finder` with:

```text
role = contributor
publication_policy = draft_directly
```

The returned identity receipt includes only the non-secret identity material needed for continuity:

- SOFA agent id;
- exact agent name;
- contributor role;
- `draft_directly` publication policy;
- normalized privileges;
- a digest of the agent description;
- observation time;
- session expiry time;
- deterministic identity fingerprint;
- the zero-authority ceiling.

The API key and session id are deliberately omitted from the receipt. The preflight permits only the canonical SOFA host and does not add a mutating SOFA call.

A successful identity preflight proves only that the supplied credential authenticated an owned SOFA identity matching the expected Flaw Finder configuration at that moment. It does not prove that a later draft or observation was produced by that identity. Draft-source binding remains a separate gate.

## What this does not prove

The current source contracts do **not** prove that:

- FCR has a configured `SOFA_API_KEY` in the deployed runtime;
- the identity preflight has succeeded against the user's live SOFA account;
- FCR can dispatch a task specifically to Flaw Finder;
- a specific observation came from Flaw Finder rather than copied text;
- SOFA runtime output is current or provider-attested;
- a SOFA finding satisfies FCR's independent-review gate;
- a SOFA draft was published;
- a recommended fix was implemented or verified.

Until provider/runtime evidence exists, FCR must preserve the distinction between a well-formed contract, an authenticated identity read, and an authenticated end-to-end review round trip.

## Promotion gate

Do not add `Flaw Finder` to the canonical FCR operator registry merely because the SOFA agent exists or because identity preflight succeeds.

Promotion requires all of the following on one exact FCR head:

1. authenticated identity preflight proving the exact owned Flaw Finder id, role, and publication policy;
2. documented SOFA capability for the needed draft/review operation;
3. authenticated dispatch or invocation that is bound to the exact Flaw Finder identity;
4. provider evidence proving which SOFA identity/runtime answered;
5. response binding back to the exact request/source fingerprint;
6. FCR validation of the external observation contract;
7. no authority widening beyond the founder-approved lane;
8. targeted unit/integration proof;
9. real Playwright proof from the FCR surface for the complete founder-visible round trip;
10. continuity receipt with rollback and unresolved risks.

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
- the final observation hash does not match the content;
- SOFA session creation fails or returns an expired session;
- `/api/me/agents` does not return exactly one owned `Flaw Finder` identity;
- the role is not `contributor`;
- the publication policy is not `draft_directly`;
- identity receipt contents are altered after the authenticated read.

## Verification

Focused source tests live in:

```text
src/review/externalFlawFinderObservation.test.ts
src/review/sofaFlawFinderIdentity.test.ts
```

Repository policy still requires the normal proof floor before merge. The identity module uses an injected `fetch` in tests so secret credentials are never required for source-level validation.

Because no deployed SOFA credential, FCR runtime adapter, or UI surface is proven yet, the live SOFA identity call and Playwright round trip remain **next proof gates**, not evidence that exists today.
