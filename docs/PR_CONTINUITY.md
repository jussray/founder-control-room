# PR Continuity Law

<!-- pr-continuity-law:v1 -->

This repository treats pull-request continuity as a machine-enforced proof contract, not a manual cleanup habit.

```text
main moves -> trusted main reacquires open PR graph -> same-repo branches roll forward conflict-free -> successor head is a new proof subject -> predecessor CI/review/runtime/Playwright proof expires -> exact-head gates rerun -> merge/deploy authority remains separate
```

## Rules

1. `main` is the root authority; stacked PRs are followed through live base branches.
2. Rollover uses GitHub `update-branch` with `expected_head_sha`. Never force-push, reset, rebase, delete, or guess through conflicts.
3. Forks, conflicts, races, malformed managed metadata, and provider uncertainty fail closed.
4. Every head movement expires predecessor CI, review, runtime, provider, artifact, and browser proof.
5. `CURRENT` ancestry is not completion; ordinary exact-head and real-path gates still apply.
6. The machine-managed PR continuity block is always rendered first as an **observation snapshot**. It records the base/head/proof subject and continuity state observed at `observed_at`; it is not permanent present-tense authority. Live GitHub metadata and fresher provider/runtime/cross-repository reads outrank the static block.
7. Continuity metadata mutation keeps exactly one start/end marker pair. Duplicate, orphaned, or reversed markers fail closed instead of rewriting the PR body.
8. Continuity receipts never authorize merge, deploy, publish, provider mutation, spend, deletion, or authority expansion.
9. Write authority runs only from trusted `main`; PR-head code receives read-only continuity verification.
10. Moving the managed block to the top is a provenance-ordering operation only. It never converts source ancestry into runtime, provider, review, Playwright, merge, or deploy proof.
11. Before a metadata write, the trusted writer re-reads the PR and refuses to write when the head SHA or base ref moved after the snapshot was built.

## Machine observation snapshot precedence

A PR may contain useful historical notes such as a predecessor exact candidate, an earlier workflow result, or a prior blocker. Those notes are not deleted. The managed block is prepended on metadata refresh as a timestamped continuity observation, while the actual live GitHub/provider state remains authoritative at use time.

```text
<!-- pr-continuity:start -->
## PR Continuity Receipt
> MACHINE OBSERVATION SNAPSHOT: ...
observed_at: ...
receipt_semantics: snapshot_not_authority
live_base: ...
live_head: ...
proof_subject: ...
continuity: ...
proof: ...
merge_authority: false
deploy_authority: false
> Live GitHub metadata, current branch tips, exact-head workflow results,
> provider/runtime readback, and cross-repository readback outrank this static snapshot.
<!-- pr-continuity:end -->

<human/history prose preserved below>
```

This keeps the fresh machine observation visually prominent without creating a false promise that a static PR description remains current after the branch, base, provider, or peer repository moves.

## Founder Control Room boundary

Founder Control Room remains the authority/evidence boundary. Continuity may roll an eligible same-repository branch forward and record proof expiry, but it does not approve a proposal, grant founder authority, merge, deploy, publish, mutate providers, spend, delete, or convert repository ancestry into runtime truth. After any rollover, FCR must reacquire exact-head CI, review, provider/runtime, artifact, and Playwright evidence before a consequential claim or merge decision.

## Attack 20

`test/pr-continuity.attack20.test.mjs` attacks ancestry, divergence, unknown state, TOCTOU, forks, observation ordering, human-body preservation, malformed markers, proof-subject binding, authority leakage, stacked propagation, unrelated stacks, cycles, and metadata-write races before any write step.
