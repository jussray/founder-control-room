---
name: goalfix
description: Find the real blocker behind a messy software goal, apply the smallest reversible fix, and verify the actual path. Use for /goalfix, /fixfast, /repair-verify-merge, ULTRATHINK repair requests, failing tests, broken deployments, regressions, and focused implementation work.
---

# Goalfix

Treat `$ARGUMENTS` as the finish line. Seek, build, fix, and verify without wandering.

## Establish the boundary

State the authoritative repo, target branch or PR, current goal, exact base/head when available, suspected failure area, first files or logs, and stop condition. Resolve unknowns with narrow inspection.

## Canonical execution lane

```text
Founder intent
→ Observe
→ Orient
→ Decide
→ Builder
→ independent Verifier
→ independent Red Team / Devil
→ exact-head merge gate
→ Founder Final
→ merge with expected-head protection
→ reacquire main
→ post-merge/runtime truth
→ recover / learn / next gate
```

## Execute OODA

1. **Observe:** inspect exact errors, failing tests, routes, configs, recent diffs, current CI, provider state, runtime logs, and live behavior. Classify material claims as VERIFIED, INFERRED, UNKNOWN, BLOCKED, or STALE.
2. **Orient:** map who decides, what changes, where truth lives, when to stop or roll back, why it matters, and how it will be tested. Establish the smallest reversible change, rollback, proof plan, and unrelated-work boundary before mutation.
3. **Decide:** choose one cause and the smallest reversible patch. Preserve valuable red/draft/superseded work until unique residue is reconciled.
4. **Builder:** touch only required files on a branch, preserve unrelated work, and add the narrowest useful test. Never suppress a signal or fake green. Builder does not self-certify.
5. **Independent Verifier:** run touched-area lint/typecheck, focused tests, targeted integration tests, and `/playwright-proof` for UI/runtime work. Bind proof to the actual candidate head and current base.
6. **Independent Red Team / Devil:** attack authority bypass, stale evidence, alternate provider/ingress paths, false-success states, scope expansion, rollback failure, and self-produced evidence.
7. **Exact-head merge gate:** require current repository, exact base SHA, exact candidate head SHA, current diff/scope, evidence IDs, CI/review state, and rollback. Machine green alone is not merge authority. If main moves, reacquire and reverify.
8. **Founder Final:** founder approval applies only to the unchanged exact candidate after required checks and review authority are current.
9. **Post-merge truth:** reacquire main and prove merged identity plus required provider/runtime/browser evidence. Merge is not completion. UI/runtime claims require Playwright.
10. **Loop:** use new evidence to continue, reverify, roll back, or stop. Report one exact next gate.

## Founder Adaptive Kernel V0

Apply `docs/FOUNDER_ADAPTIVE_KERNEL_V0.md` to every Goalfix loop across every Juss-owned project.

Compare expected state with verified observed state and classify the surprise:

```text
STRONGER_THAN_EXPECTED
AS_EXPECTED
WEAKER_THAN_EXPECTED
UNEXPECTED_DIRECTION
UNKNOWN
```

Then choose exactly one primary adaptive action:

```text
ACCELERATE
CONTINUE
REPAIR
REORIENT
HOLD
STOP
```

Accelerate only from current verified evidence. If the user, system, test, runtime, or product behaves in a useful unexpected way, update the expectation and plan rather than forcing the old script.

For meaningful loops, bind a continuity fingerprint to project/repository identity, intent, expected state, observed state, evidence identities, and exact base/head/scope when applicable. A load-bearing change invalidates prior green for the affected claim.

Maintain a bounded continuity cookie containing non-secret resumability metadata such as kernel version, project ID, fingerprint, parent fingerprint, surprise signal, adaptive action, evidence references, truth state, and next gate. This is a proof/learning receipt only. It is not an HTTP/browser cookie, credential, tracking ID, or authority object.

Never put secrets, tokens, raw private data, chain-of-thought, or unnecessary user content into a continuity cookie. Fingerprints and cookies preserve lineage but never authorize merge, deploy, publish, provider mutation, or founder decisions.

After a meaningful surprise, retain the smallest durable learning patch that changes future expectations without rewriting historical evidence.

Treat `ULTRATHINK/steal` as deeper reasoning, not a larger patch. Extract causal mechanisms and synthesize an original solution. Do not copy protected expression, branding, private material, secrets, or incompatible code. Score candidates by founder value, durability, reversibility, authority, evidence, rollback, and compounding value.

Do not merge unless the user requested it or checked-in repository policy grants standing merge authority. Required checks, required review authority, and real-path evidence must be current. Never turn a deployment preview or historical green into merge/runtime proof.

Return `REALITY`, `FIX`, `PROOF`, `RISK`, `ROLLBACK`, `ADAPTIVE SIGNAL`, and `NEXT GATE`.