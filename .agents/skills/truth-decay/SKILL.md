---
name: truth-decay
description: >
  Audit any claim, memory, PR narrative, status file, product-progress statement, or AI
  conclusion that may have been true when recorded but is now false, stale, superseded,
  or unknown. Classifies every load-bearing claim as CURRENT, HISTORICAL, STALE,
  SUPERSEDED, or UNKNOWN. Finds the causal invalidation boundary. Repairs the smallest
  authoritative control — not just prose. Use whenever Juss invokes /TRUTHMODE,
  questions whether something is "still true," audits a status doc, reviews a PR
  narrative, checks memory accuracy, or says "verify this." Also triggers on any
  present-tense operational claim that could be stale. Never green without fresh proof.
---

# Truth Decay Audit

## Authority order (highest wins)

1. Fresh provider/runtime/repo observation (now)
2. Exact-head machine evidence (SHA-pinned)
3. Explicit current founder authority
4. Current governing contracts/code
5. Current documentation
6. Historical documentation
7. Old PRs / issues / summaries
8. Chat / model memory

> Historical evidence = valid provenance. NOT current authority.

---

## Start narrow

Before reading anything broadly, state:

- **Authoritative repo + branch**
- **Exact current main SHA**
- **Current goal**
- **Suspected truth-decay boundary** (when did reality likely diverge?)
- **First files/logs/provider reads needed**
- **Stop condition**

Never scan the whole repo when an exact claim, file, SHA, or failure is already known.

---

## Claim reconstruction chain

For every load-bearing claim:

```
CLAIM
↓
T1: when was it actually verified?
↓
EVIDENCE: what proved it at T1?
↓
MUTATION: what later changed reality?
↓
INVALIDATION BOUNDARY: when should old proof have expired?
↓
REUSE: where was stale proof reused as current?
↓
FAILURE: how did historical truth become a present-tense claim?
```

### Classification

| Label | Meaning |
|---|---|
| CURRENT | Fresh proof exists, verified now |
| HISTORICAL | Was true, proof exists, not re-verified |
| STALE | Was true, reality likely changed, no re-verification |
| SUPERSEDED | Explicitly replaced by newer authority |
| UNKNOWN | Missing, conflicting, inaccessible, or over-age evidence |
| BLOCKED | Would be verifiable but access is denied |

**Only CURRENT may support present-tense operational claims.**

Missing or inaccessible evidence → UNKNOWN. Never coerce to green.

A SHA proves identity of what was inspected. It does not prove mutable reality stayed unchanged.

---

## Product Design check

Do not collapse these states into one green badge:

`loading / empty / partial / blocked / denied / error / stale / superseded / unknown / success`

Make the **next real gate** visible to the founder.

For UI/runtime changes: Playwright evidence required on the exact candidate SHA.

---

## Analytics as observation only

Analytics may inform the next decision. They may NOT:
- Renew stale truth
- Authorize publication
- Manufacture a business claim

Separate: capability → configuration → execution → provider outcome → user outcome → business outcome

---

## Redteam I — attack the premise

Before implementing any repair, ask:

- Should this change exist?
- Is the supposed bug actually stale evidence?
- Is a provider result being confused with product truth?
- Is a document outranking live reality?
- Are two agents interpreting the same evidence — mistaken for independent proof?
- Are we solving a symptom instead of the invalidation boundary?
- Could this leak proprietary implementation details?
- Could Current You accidentally override contradictory objective evidence?
- Could FutureYou reuse this output after reality changes?

---

## Decide — one focused repair

Prefer in order:
1. Authority fix
2. State / invalidation fix
3. Verifier / contract
4. Focused test
5. Documentation sync

Rules:
- One cause before many symptoms
- Smallest reversible patch
- No unrelated refactor
- Preserve history — demote stale evidence, never delete or rewrite it
- No direct-to-main ordinary implementation

---

## Verify and merge

Cheapest valid proof first:

1. Focused contract/unit check
2. Typecheck/lint/build on touched area
3. Focused integration test
4. Targeted Playwright for UI/runtime changes
5. Exact-head CI/provider proof
6. Final diff review
7. Re-read current base immediately before merge
8. Merge only the reviewed exact head
9. Resolve resulting exact main SHA
10. Re-observe affected provider/runtime/docs after merge

A merge ≠ deployment ≠ publication ≠ runtime correctness ≠ user outcome.

---

## Redteam II — attack the implementation

Before merge, check for:
- Stale base / moved head
- False green
- Correlated evidence presented as independent proof
- Truth renewed by documentation alone
- Publication without explicit Current You authority
- Analytics widening authority beyond observation
- Provider success without outcome readback
- Sauce leakage
- Duplicate execution
- Rollback failure
- Post-merge docs becoming stale immediately

---

## Report format

```
REALITY:
  What is verified now.
  Classify each claim: CURRENT / HISTORICAL / STALE / SUPERSEDED / UNKNOWN / BLOCKED

FIX:
  Exact files/contracts changed.
  Why this is the smallest durable repair.

PROOF:
  SHA, tests, CI, Playwright, provider readback, runtime evidence, receipts.
  Only what actually ran.

RISK:
  What may still be wrong or decay later.

ROLLBACK:
  Exact safe reversal.

NEXT GATE:
  One founder decision or bottleneck.
```

If evidence cannot support a claim → say **UNKNOWN**.

Do not turn yesterday's truth into today's lie.
