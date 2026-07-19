# Founder Merge Authority

## Current founder decision

Juss authorizes repository changes to be merged when the acting AI or operator determines that the merge is appropriate and the evidence supports that conclusion.

This standing authority replaces blanket `do not merge` language in active operating instructions. It does not require another merge-only confirmation when all merge conditions below are satisfied.

## Merge conditions

A merge is appropriate only when:

- the repository, pull request, target branch, and exact head SHA are verified;
- the intended scope is understood and no unrelated work is being smuggled into the change;
- code and configuration changes have been reviewed;
- required checks have genuinely executed and passed, or a documented infrastructure failure has been distinguished from code-test evidence and the remaining verification is sufficient for the specific change;
- no unresolved critical review thread remains;
- privacy, security, brand, IP, credential, and user-data boundaries remain intact;
- rollback or safe forward-fix is understood;
- the merge itself does not silently execute a separately gated action.

## Separate gates remain separate

This standing merge authority does not automatically authorize:

- production deployment or public release;
- database migration or destructive data writes;
- authentication, authorization, allowlist, RLS, credential, or secret changes;
- spending, billing, plan upgrades, paid infrastructure, or commercial commitments;
- DNS, domain, provider-ownership, or production-routing changes;
- account creation, deletion, distribution, publication, or external communication;
- deletion of branches, files, records, history, or user material.

Those actions still require their own exact approval unless a later founder directive explicitly grants standing authority for that category.

## Operating rule

Do not merge merely because a PR exists or because a badge looks green. Merge when it is the correct, evidence-backed integration step. When it is not appropriate, leave the PR open and state the exact blocker.
