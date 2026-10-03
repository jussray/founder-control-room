# URLFix Merge Review Handoff

Status: `CANDIDATE CONTRACT`

URLFix may prepare a repair for merge review. URLFix never grants merge authority and never treats browser proof, a passing source check, or a repair commit as merge approval.

The merge-review path is:

`URLFix repair/proof -> exact repo/PR/base/head packet -> review-verify-merge -> fresh PR truth -> exact-candidate approval -> merge, only if separately authorized`

## When to hand off

Hand off only when all of the following are true:

- the repair is in the canonical repository;
- a compatible existing pull request carries the repair;
- the PR scope remains coherent with the repair objective;
- the current base ref + exact base SHA are known;
- the current head ref + exact head SHA are known;
- URLFix proof references are bound to that exact head SHA;
- merge review is requested by the founder/operator or by checked-in policy.

If no compatible PR exists, report `MERGE_REVIEW_BLOCKED_NO_PR`. Do not create a PR merely to satisfy URLFix.

## Handoff packet

Emit `juss/urlfix-merge-review@v1`, validated by `config/urlfix-merge-review.schema.json` and `scripts/urlfix-merge-review-contract.mjs`.

The packet binds:

- repository;
- PR number;
- base ref + exact 40-character base SHA;
- head ref + exact 40-character head SHA;
- URLFix issue IDs;
- repair carrier;
- highest URLFix proof state actually observed;
- exact-head proof references;
- residual risk;
- `REVIEW_ONLY` intent;
- `review-verify-merge` as the reviewing skill;
- `mergeAuthorized: false`;
- an explicit rule that base/head movement expires the packet.

A branch name without an exact SHA is not a merge-review subject.

## Review-verify-merge owns merge readiness

After handoff, `review-verify-merge` must independently reacquire current repository truth. It must re-read the PR, current base SHA, current head SHA, diff, checks, reviews, mergeability, relevant browser/runtime evidence, and exact-candidate approval state.

URLFix evidence is input evidence, not a merge decision.

If base or head moves after the packet is issued:

1. expire the URLFix merge-review packet;
2. do not carry prior approval forward;
3. reacquire exact-head source/browser proof as required;
4. rebuild a fresh packet;
5. rerun `review-verify-merge` against the new candidate.

## Legal URLFix merge-review outcomes

URLFix may report:

- `MERGE_REVIEW_NOT_REQUESTED`
- `READY_FOR_MERGE_REVIEW`
- `MERGE_REVIEW_BLOCKED_NO_PR`
- `MERGE_REVIEW_BLOCKED_STALE_REFS`
- `MERGE_REVIEW_BLOCKED_PROOF_HEAD_MISMATCH`

URLFix must never report `MERGE_APPROVED`, `MERGED`, or equivalent unless that state is independently returned and proven by the merge-review/execution lane.

## Post-merge boundary

A successful merge proves source integration only after the target branch is re-read and shown to contain the merged result. It does not prove deployment or live runtime state.

If the original URL is part of the goal, production verification remains a separate URLFix/runtime proof step against the post-merge deployed runtime.
