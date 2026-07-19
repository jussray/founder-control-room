# Founder Merge Authority

## Current founder decision

Juss authorizes repository changes to be merged when the acting AI or operator determines that the merge is appropriate and the evidence supports that conclusion.

This standing authority replaces blanket `do not merge` language in active operating instructions. It does not require another merge-only confirmation when all merge conditions below are satisfied.

## Merge conditions

A merge is appropriate only when:

- the repository, pull request, target branch, and exact head SHA are verified;
- the intended scope is understood and no unrelated work is being smuggled into the change;
- code, configuration, docs, schemas, generated artifacts, and release-impacting changes have been reviewed;
- required checks have genuinely executed and passed, or a documented infrastructure failure has been classified and distinguished from code-test evidence;
- zero-step/no-log GitHub Actions failures are classified as `runner_startup_failure` or `workflow_no_jobs`, not as code regressions;
- a `workflow_step_failure` is not waved away as infrastructure when logs show a real failing command, assertion, build, type, lint, or Playwright step;
- Playwright has passed for any changed user-facing web/runtime path, or is explicitly inapplicable;
- Founder Control Room release-truth evidence has been checked when the change affects release, deployment, cross-repo coordination, or incident interpretation;
- Cloudflare build/deploy evidence has been checked when Cloudflare is part of the release path, while keeping Cloudflare truth separate from GitHub Actions truth;
- no unresolved critical review thread remains;
- privacy, security, brand, IP, credential, and user-data boundaries remain intact;
- rollback or safe forward-fix is understood;
- the merge itself does not silently execute a separately gated action.

## Infrastructure outage rule

A GitHub Actions infrastructure outage can gate merge and release truth without proving a code regression.

When jobs have no executed steps or no logs, agents must not blame the diff. They must record the exact PR, head SHA, workflow, run, job evidence, classification, impact, Cloudflare/runtime evidence if available, and the next gate in Founder Control Room.

If remaining evidence is sufficient for a docs-only, policy-only, or otherwise low-risk focused change, a merge may still be appropriate. If the change requires executed CI, Playwright, deployment proof, auth proof, migration proof, or runtime proof that is unavailable because of the outage, leave the PR open and state the exact blocker.

## Canonical project routing

Only `jussray/Sekret-Bip` is the active Se’kret Bip working repository. Other Bip-named repositories are historical or investigate-only unless Founder Control Room explicitly names one for provenance capture.

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
