# Repository Health: Duplicate Work and Branch Hygiene

This policy prevents duplicate implementation paths, stale branch families, and false confidence about which branch or pull request owns a change.

## Canonical ownership

Each logical change must have exactly one active implementation branch and one pull request.

Before creating a branch:

1. Inspect `main` and recent open pull requests.
2. Search for an existing branch or PR that already owns the same goal.
3. Continue the canonical branch when it exists instead of starting a replacement.

## Branch naming

Create branches once from the current `main` using a descriptive prefix:

- `fix/*` for bug fixes
- `chore/*` for maintenance, governance, or documentation
- `feat/*` for new product behavior

Do not create versioned or status-suffixed duplicates such as:

- `*-v2`
- `*-v3`
- `*-current-main`
- `*-final`
- `*-latest`
- `*-new`

A branch name describes the change, not the number of attempts.

## One-change, one-PR rule

- Open one pull request for the logical change.
- Push follow-up corrections, review responses, and merge-conflict resolutions to that branch.
- Do not open a replacement PR merely because the first attempt needs repair.
- If a branch truly must be replaced, close the old PR, document why, and explicitly identify the new canonical PR.

## Duplicate cleanup

When duplicate work is discovered:

1. Identify the branch or PR with the strongest current evidence and clearest ownership.
2. Preserve any unique valid work from the duplicates.
3. Move or reimplement that work in the canonical branch.
4. Close superseded PRs with a link to the canonical PR.
5. Delete obsolete branches only with the exact deletion authority required by repository policy.

## Reporting standard

Every implementation report must state:

- repository
- canonical branch
- pull request number
- exact head SHA
- whether duplicate branches or PRs were found
- what was preserved
- what remains blocked

Branch creation is not progress by itself. The proof is one traceable change path from `main` through review, verification, merge, deployment when applicable, and runtime evidence.
