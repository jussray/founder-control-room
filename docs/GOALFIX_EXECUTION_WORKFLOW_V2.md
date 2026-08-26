# Goalfix Execution Workflow v2

Status: `SOURCE CONTRACT / MERGE PENDING`

This is the repository-owned operating contract for focused founder-directed implementation.

## Canonical lane

```text
FOUNDER INTENT
  ↓
OBSERVE
  ↓
ORIENT
  ↓
DECIDE
  ↓
BUILDER
  ↓
INDEPENDENT VERIFIER
  ↓
INDEPENDENT RED TEAM / DEVIL
  ↓
EXACT-HEAD MERGE GATE
  ↓
FOUNDER FINAL
  ↓
MERGE WITH EXPECTED HEAD
  ↓
REACQUIRE MAIN
  ↓
POST-MERGE / RUNTIME TRUTH
  ↓
RECOVER / LEARN / NEXT GATE
```

## Founder Adaptive Kernel

Every Goalfix loop also applies `docs/FOUNDER_ADAPTIVE_KERNEL_V0.md`.

After observation, compare expected state with verified observed state, classify the surprise as `STRONGER_THAN_EXPECTED`, `AS_EXPECTED`, `WEAKER_THAN_EXPECTED`, `UNEXPECTED_DIRECTION`, or `UNKNOWN`, then choose one primary action: `ACCELERATE`, `CONTINUE`, `REPAIR`, `REORIENT`, `HOLD`, or `STOP`.

For meaningful state transitions, preserve:

- a deterministic continuity fingerprint bound to the current intent/state/evidence and exact base/head/scope when applicable;
- a bounded continuity cookie containing non-secret lineage, surprise, decision, evidence references, truth state, and next gate.

Fingerprints and continuity cookies are provenance/learning receipts only. They are not browser cookies, credentials, tracking IDs, founder authority, merge authority, deploy authority, or publication authority.

If a load-bearing fingerprint input changes, dependent green evidence becomes historical and must be reacquired before promotion.

## Load-bearing rules

1. Current repository/provider/runtime evidence outranks prior summaries, email, memory, or old receipts.
2. Every merge decision binds to the exact repository, base SHA, candidate head SHA, current diff/scope, evidence IDs, and current CI/review state.
3. Builder implements but does not self-certify.
4. Verifier and Red Team are independent load-bearing lanes.
5. Machine green is not merge authority.
6. If `main` or the candidate head changes, dependent merge-readiness evidence becomes historical and must be reacquired.
7. Deployment or preview success is evidence of that deployment only, not proof of merge authority or current production equivalence.
8. UI/runtime claims require Playwright evidence.
9. A real failing signal is never suppressed merely to make a gate green.
10. Merge is not completion. Reacquire `main` and verify required provider/runtime/browser truth after integration.
11. Red, draft, stale, closed, and superseded work must be inspected for unique code, tests, decisions, or evidence before retirement.
12. Unexpected verified behavior updates the next expectation; do not force a stronger or differently successful path back into the previous script.
13. Acceleration requires current verified evidence and cannot widen authority.

## Evidence states

- `VERIFIED`: current authoritative evidence supports the claim.
- `INFERRED`: evidence suggests the claim but does not prove it.
- `UNKNOWN`: required evidence has not been observed.
- `BLOCKED`: required authority or evidence cannot currently be obtained.
- `STALE`: evidence was previously valid but no longer matches current state.

## Status board

- `RED`: real failure or unresolved material blocker.
- `VERIFYING`: implementation exists; proof incomplete.
- `GREEN`: fresh machine evidence passes; authority may remain.
- `REVIEW`: independent review authority pending.
- `MERGED`: integrated into current main.
- `RUNTIME_VERIFIED`: merged artifact proven in intended environment.
- `SUPERSEDED`: historical value preserved; no longer authoritative.
- `BLOCKED`: required external authority/evidence unavailable.

## Verification order

Use the cheapest valid proof first:

1. touched-area typecheck or lint;
2. focused unit/integration test;
3. targeted Playwright for browser/UI/runtime behavior;
4. exact-head CI;
5. provider/deployment/runtime readback.

The adaptive kernel may move a proof class earlier when repeated verified failures show the cheaper order is no longer the truthful fastest path. That learning must be recorded without weakening the proof requirement.

## Merge liveness

A candidate is merge-eligible only while its current evidence still matches its current base/head/scope and required review authority remains current. If `main` moves, reacquire the focused change and rerun affected verification rather than inheriting old green.

Use expected-head protection for merge so a moved candidate cannot be integrated under stale authority.

## Post-merge truth

After merge:

1. reacquire current `main`;
2. confirm the intended change is integrated;
3. rerun required post-merge checks;
4. obtain provider/runtime/browser evidence where applicable;
5. report `MERGED_UNVERIFIED` until required runtime proof exists;
6. capture the next exact gate.

## Report contract

```text
REALITY:
[verified current state]

FIX:
[focused implementation]

PROOF:
[current tests, CI, Playwright, provider/runtime evidence]

RISK:
[what could still be wrong]

ROLLBACK:
[how to reverse safely]

ADAPTIVE SIGNAL:
[surprise signal + adaptive action + fingerprint/cookie lineage when material]

NEXT GATE:
[one exact founder decision or next action]
```