# PR Continuity Law

<!-- pr-continuity-law:v1 -->

This repository treats pull-request continuity as a machine-enforced proof contract, not a manual cleanup habit.

```text
main moves -> trusted main reacquires open PR graph -> same-repo branches roll forward conflict-free -> successor head is a new proof subject -> predecessor CI/review/runtime/Playwright proof expires -> exact-head gates rerun -> merge capability remains available but exact-candidate founder approval must be reacquired before merge
```

## Rules

1. `main` is the root authority; stacked PRs are followed through live base branches.
2. Rollover uses GitHub `update-branch` with `expected_head_sha`. Never force-push, reset, rebase, delete, or guess through conflicts.
3. Forks, merge conflicts, repository-rule blockers, provider-forbidden updates, provider rejections, races, malformed managed metadata, and provider uncertainty fail closed. Distinct blockers must remain distinct in the machine state and receipt rather than being collapsed behind one generic failure label.
4. Every head movement expires predecessor CI, review, runtime, provider, artifact, browser proof, and any merge approval bound to the predecessor candidate.
5. `CURRENT` ancestry is not completion; ordinary exact-head and real-path gates still apply.
6. The machine-managed PR continuity block is always rendered first. It governs present-tense base/head/proof-subject identity and continuity status. Human prose is preserved below it as historical/contextual text; any SHA or status prose below is historical unless it matches the machine block.
7. Continuity metadata mutation keeps exactly one start/end marker pair. Duplicate, orphaned, or reversed markers fail closed instead of rewriting the PR body.
8. `merge_authority: true` means the merge capability/authority class is available. It does **not** approve the current candidate. Continuity receipts remain non-authorizing and must also state that exact-candidate merge approval is required and currently absent unless a separate authenticated approval receipt proves otherwise.
9. If explicit founder approval for the exact repository, PR number, live base SHA, and live head SHA is absent, ambiguous, or stale, the agent/operator must ask and stop. Approval never carries across base/head movement.
10. Continuity receipts never authorize deploy, publish, provider mutation, spend, deletion, or authority expansion.
11. Write authority runs only from trusted `main`; PR-head code receives read-only continuity verification.
12. Moving the managed block to the top is a truth-ordering operation only. It never converts source ancestry into runtime, provider, review, Playwright, merge-approval, or deploy proof.
13. Rollover receipts must expose `blockedByState` plus individual `failureReceipts`. When one GitHub response contains multiple repository-rule violations, each material condition gets its own receipt entry so one blocker cannot hide or stand in for another.
14. A push-level rollover observer may report successful execution after it has durably recorded a known blocked open-PR graph. That operational success means only that the observation and receipt succeeded. The aggregate receipt remains `BLOCKED_PR_DEBT`, and every affected PR remains fail-closed until its own current-head continuity and exact-head proof gates pass. Unknown errors, GitHub API failures, missing/malformed receipts, and unclassified rollover failures still fail the observer.

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
merge_authority: true
merge_approval: REQUIRED_EXACT_CANDIDATE
merge_approved: false
authorizes_merge: false
deploy_authority: false
<!-- pr-continuity:end -->

<human/history prose preserved below>
```

This removes the ambiguity where stale prose could visually outrank a fresh machine receipt while retaining the historical record for auditability. It also prevents the availability of merge authority from being confused with founder approval to execute a specific merge.

## Failure receipt separation

`update-branch` failures are evidence, not one interchangeable red light. The rollover contract keeps at least these states separate:

- `BLOCKED_STACK_REBASE_REQUIRED` for the provider's explicit stacked-PR update limitation;
- `BLOCKED_REPOSITORY_RULES` for repository policy enforcement, with separate receipt entries for conditions such as PR-only writes, an expected required check, or pending/unconfigured code-scanning evidence when those conditions are present in the provider response;
- `BLOCKED_MERGE_CONFLICT` for an actual merge conflict between base and head;
- `BLOCKED_PROVIDER_FORBIDDEN` for other 403 provider refusals; and
- `BLOCKED_PROVIDER_REJECTED` for otherwise unclassified 422 validation/update rejections.

The aggregate rollover remains blocked while any of those states exist. More precise receipts do not turn a blocker green, weaken repository rules, grant branch-update authority, or erase the provider's original message. On trusted `main`, the push-level observer may still complete successfully after recording that blocked aggregate as `BLOCKED_PR_DEBT`; this distinguishes a truthful blocked PR graph from a broken observer. Individual PR continuity gates remain strict and do not inherit that operational success.

## Founder Control Room boundary

Founder Control Room remains the authority/evidence boundary. Continuity may roll an eligible same-repository branch forward and record proof expiry, but it does not approve a proposal, grant candidate-specific founder approval, merge, deploy, publish, mutate providers, spend, delete, or convert repository ancestry into runtime truth. After any rollover, FCR must reacquire exact-head CI, review, provider/runtime, artifact, and Playwright evidence. Before any merge execution, it must also reacquire a fresh explicit founder approval bound to the exact current repository, PR, base SHA, and head SHA.

## Attack 20

`test/pr-continuity.attack20.test.mjs` attacks ancestry, divergence, unknown state, TOCTOU, forks, machine-truth ordering, human-body preservation, malformed markers, proof-subject binding, authority/approval separation, stacked propagation, unrelated stacks, cycles, and provider-failure separation before any write step. `test/pr-continuity.rollover-observation.test.mjs` separately verifies that known, receipted PR debt can be reported without disguising operational failures or weakening strict per-PR continuity.
