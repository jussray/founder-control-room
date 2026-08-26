---
name: goalfix
description: Find the real blocker behind a messy software goal, apply the smallest reversible fix, and verify the actual path. Use for /goalfix, /fixfast, /repair-verify-merge, ULTRATHINK repair requests, failing tests, broken deployments, regressions, and focused implementation work.
---

# Goalfix

Treat `$ARGUMENTS` as the finish line. Seek, build, fix, and verify without wandering.

## Establish the boundary

State the authoritative repo, target branch, current goal, suspected failure area, first files or logs, and stop condition. Resolve unknowns with narrow inspection.

## Execute OODA

1. **Observe:** inspect exact errors, failing tests, routes, configs, recent diffs, runtime logs, and live behavior.
2. **Orient:** map who decides, what changes, where truth lives, when to stop or roll back, why it matters, and how it will be tested.
3. **Decide:** choose one cause and the smallest reversible patch. Red-team whether it should exist and how it could fail.
4. **Act:** touch only required files, preserve unrelated work, and add the narrowest useful test. Never suppress a signal or fake green.
5. **Verify:** run touched-area lint/typecheck, focused test, targeted integration test, then real browser flow as applicable. Invoke `/playwright-proof` for UI/runtime work.
6. **Loop:** use new evidence to repeat only within the focused cause. Stop when the condition is met or new authority is required.

Treat `ULTRATHINK/steal` as deeper reasoning, not a larger patch. Extract causal mechanisms and synthesize an original solution. Do not copy protected expression, branding, private material, secrets, or incompatible code. Score candidates by founder value, durability, reversibility, authority, evidence, rollback, and compounding value.

## Execution workflow v2

When inspection advances into approved implementation, use the repository-owned contract in `src/goalfix/executionWorkflow.ts` and `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`.

The load-bearing lane is:

```text
Founder intent
→ Observe
→ Orient
→ Decide
→ Builder
→ independent Verifier
→ independent Red Team / Devil
→ exact-head merge gate
→ founder merge decision
→ merge with expected-head protection
→ reacquire main
→ post-merge/runtime truth
→ complete
```

Use the strategy stack deliberately:

- **Art of War:** know the ground, win before fighting, avoid unnecessary siege, reuse verified asymmetry, preserve future options.
- **Lindy Mode:** prefer the smallest durable reversible fix; reject temporary green theater.
- **L99:** keep authority, state, evidence, rollback, and compounding value explicit.
- **OODA:** use fresh evidence to decide whether to continue, reverify, roll back, or stop.

Every load-bearing Builder/Verifier/Red-Team checkpoint must carry the exact repository/base/head/diff fingerprint plus ATTACK-20 V3 `ProofBinding` provenance. Proof cookies are internal continuity metadata only, never HTTP cookies, auth tokens, credentials, secrets, or tracking identifiers.

Builder cannot self-certify. Verifier and Red Team must be independent. If `main` moves after proof, prior green becomes historical and the focused change must be reacquired and reverified. Machine green is not merge authority. Founder approval must bind to the exact candidate head and diff fingerprint. Merge is not completion; reacquire main and obtain required runtime/provider/Playwright proof afterward.

Do not merge unless the user requested it or checked-in repository policy grants standing merge authority. Required checks plus real-path evidence must be green, except when `/review-verify-merge` verifies a checked-in repository policy that explicitly permits a classified infrastructure-outage exception with sufficient alternative evidence and no protection bypass. Return `REALITY`, `FIX`, `PROOF`, `RISK`, `ROLLBACK`, and one `NEXT GATE`.
