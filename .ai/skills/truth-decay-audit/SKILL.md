---
name: truth-decay-audit
description: >
  Audit a claim, document, status, receipt, or public progress statement that
  was once true and determine exactly what changed before it was reused.
  Preserve historical truth, fail closed on stale current-state claims, and
  feed the causal lesson into FutureYou without granting it execution authority.
version: 1.0
visibility: private
owner: Juss
triggers:
  - /truth-decay
  - /truthdecay
  - once true now false
  - audit what made this stale
---

# /truth-decay — Audit how truth became unsafe

## Mission

Given a claim that was previously verified, identify the exact transition that
made its later use stale, superseded, invalidated, ambiguous, or unknown.

Do not call the earlier fact a lie merely because reality moved. Preserve what
was historically verified, then explain why the old evidence no longer has
current authority.

## Required source order

1. Current authoritative repository/provider/runtime/human-outcome observation.
2. The exact historical evidence, SHA, receipt, timestamp, or artifact that made the claim true.
3. Current documentation or public copy that reused the claim.
4. Current You intent and approval, kept separate from objective evidence.
5. FutureYou/history as advisory context only.

## Workflow

### OBSERVE

Pin:

- original claim;
- original truth class;
- exact identity/version/time it was verified against;
- intended use boundary now: merge, deploy, schedule, publish, or completion claim;
- every load-bearing dependency and its authority;
- fresh at-use observations.

Classify facts as VERIFIED / INFERRED / UNKNOWN / BLOCKED.

### ORIENT

Build the transition chain:

```text
verified fact
→ evidence/identity/time that supported it
→ dependency/version/provider/time transition
→ attempted reuse
→ current classification
```

Check at least:

- repository identity moved;
- provider/runtime state moved;
- evidence aged out;
- authority source changed;
- observation disappeared or became ambiguous;
- current wording silently widened a historical fact;
- a metric inherited the wrong authority;
- docs or memory outlived their source evidence;
- approval was mistaken for objective truth.

### DECIDE

Return one of:

- CURRENT: fresh authoritative evidence still matches;
- HISTORICAL VERIFIED: exact old fact remains true as history, but cannot support current wording;
- RE-CHECK REQUIRED: evidence may still match but is too old for the use boundary;
- SUPERSEDED / INVALIDATED: an authoritative dependency changed;
- UNKNOWN: current evidence is missing, conflicting, malformed, or unusable.

Only CURRENT may support a present-tense operational claim.

### ACT

Use the smallest corrective action:

- re-observe the load-bearing dependency;
- rewrite current wording as explicitly historical when valid;
- rebuild the claim from fresh evidence when reality changed;
- refresh truth-sensitive docs when they are the stale retrieval surface;
- hold publication or completion claims when evidence is unknown.

Never renew truth from memory, analytics, an unchanged hash, a founder approval,
a PR description, or a scheduler/provider success signal.

### FUTUREYOU LESSON

Record only the reusable causal rule, not private evidence or sauce.

Good lesson:

> Exact PR-head proof expires as current-main authority after merge identity moves;
> re-observe merged main before saying main is green.

Bad lesson:

> Keep trusting the old SHA because it passed once.

FutureYou may recommend the next check. It may not silently authorize execution,
publication, merge, provider mutation, or a new truth claim.

## Product Design

Render separate states, never one generic green badge:

- Current proof
- Historical verified
- Re-check required
- Truth changed
- Proof missing

Always show the next gate.

## Data Analytics

Safe telemetry may include state, cause class, use boundary, dependency counts,
stale/invalidated/unknown counts, revalidation success, and time-to-correction.

Never emit raw claim text, raw diffs, private prompts, evidence digests, credentials,
provider payloads, private metrics, customer data, or proprietary implementation.
Analytics is observation-only and cannot renew truth.

## Redteam

Before accepting the result, attack it:

1. Did we preserve a historical fact that was actually never proven?
2. Did we call something stale when the authoritative value truly changed?
3. Did we use repository evidence to prove provider/runtime/metric truth?
4. Did founder approval override contradictory objective evidence?
5. Did a clean document or hash hide stale underlying reality?
6. Did duplicate observations become last-row-wins truth?
7. Did the correction leak the private recipe while explaining the lesson?
8. Could this audit itself become a second truth authority?

If #8 is yes, stop. The audit explains evidence; it never replaces the source authority.

## Output

```text
REALITY:
[what is current now]

WAS TRUE:
[exact historical fact + identity/time]

DECAY CAUSE:
[the smallest causal transition]

CURRENT CLASS:
[CURRENT / HISTORICAL VERIFIED / RE-CHECK REQUIRED / SUPERSEDED / UNKNOWN]

FIX:
[smallest correction or re-observation]

FUTUREYOU LESSON:
[portable causal rule]

PROOF:
[current and historical evidence]

RISK:
[remaining ambiguity]

ROLLBACK:
[how to reverse the correction safely]

NEXT GATE:
[one exact next action]
```
