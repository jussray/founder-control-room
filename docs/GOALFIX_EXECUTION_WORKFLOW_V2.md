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

NEXT GATE:
[one exact founder decision or next action]
```
