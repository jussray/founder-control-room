# PR Continuity Law

<!-- pr-continuity-law:v1 -->

This repository treats pull-request continuity as a machine-enforced proof contract, not a manual cleanup habit.

```text
main moves -> trusted main reacquires open PR graph -> same-repo branches roll forward conflict-free -> successor head is a new proof subject -> predecessor CI/review/runtime/Playwright proof expires -> exact-head gates rerun -> merge/deploy authority remains separate
```

## Rules

1. `main` is the root authority. Every continuity decision resolves the PR's live `base.ref` to its current provider SHA at the use boundary; GitHub's `pr.base.sha` is a historical snapshot and must never decide whether a carrier is `CURRENT`. Stacked PRs resolve their parent branch the same way.
2. Rollover uses GitHub `update-branch` with `expected_head_sha`. Never force-push, reset, rebase, delete, or guess through conflicts.
3. Forks, conflicts, races, malformed managed metadata, missing live-base identity, and provider uncertainty fail closed.
4. Every head movement expires predecessor CI, review, runtime, provider, artifact, and browser proof.
5. `CURRENT` ancestry is not completion; ordinary exact-head and real-path gates still apply.
6. The machine-managed PR continuity block is always rendered first. It governs present-tense base/head/proof-subject identity and continuity status. Human prose is preserved below it as historical/contextual text; any SHA or status prose below is historical unless it matches the machine block.
7. Continuity metadata mutation keeps exactly one start/end marker pair. Duplicate, orphaned, or reversed markers fail closed instead of rewriting the PR body.
8. Continuity receipts never authorize merge, deploy, publish, provider mutation, spend, deletion, or authority expansion.
9. Write authority runs only from trusted `main`; PR-head code receives read-only continuity verification.
10. Moving the managed block to the top is a truth-ordering operation only. It never converts source ancestry into runtime, provider, review, Playwright, merge, or deploy proof.

## Live-base observation rule

GitHub pull-request payloads can retain the base SHA that existed when a PR snapshot was produced even after the named base branch advances. Continuity therefore treats the base **ref name** as the pointer and resolves that ref immediately before each compare, metadata classification, and post-update race check.

```text
PR says base.ref = main
PR snapshot says base.sha = OLD
provider says refs/heads/main = NEW

continuity base authority = NEW
OLD = historical snapshot only
```

For stacked carriers, the same rule applies to the live parent branch. A child whose stored base snapshot is still an ancestor of its head is not `CURRENT` if the live parent branch has moved beyond that snapshot.

## Machine current truth precedence

A PR may contain useful historical notes such as a predecessor exact candidate, an earlier workflow result, or a prior blocker. Those notes are not deleted. Instead the managed block is prepended on every metadata refresh and states that it is the authoritative present-tense identity receipt.

```text
<!-- pr-continuity:start -->
## PR Continuity Receipt
> MACHINE CURRENT TRUTH: ...
live_base: ...
live_head: ...
proof_subject: ...
continuity: ...
proof: ...
merge_authority: false
deploy_authority: false
<!-- pr-continuity:end -->

<human/history prose preserved below>
```

This removes the ambiguity where stale prose could visually outrank a fresh machine receipt while retaining the historical record for auditability.

## Founder Control Room boundary

Founder Control Room remains the authority/evidence boundary. Continuity may roll an eligible same-repository branch forward and record proof expiry, but it does not approve a proposal, grant founder authority, merge, deploy, publish, mutate providers, spend, delete, or convert repository ancestry into runtime truth. After any rollover, FCR must reacquire exact-head CI, review, provider/runtime, artifact, and Playwright evidence before a consequential claim or merge decision.

## Attack 20

`test/pr-continuity.attack20.test.mjs` attacks ancestry, divergence, unknown state, TOCTOU, forks, machine-truth ordering, human-body preservation, malformed markers, proof-subject binding, authority leakage, stacked propagation, unrelated stacks, cycles, frozen root-base snapshots, and stale stacked-parent snapshots before any write step.
