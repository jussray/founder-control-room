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
- **Documentation truth has been reconciled:** truth-sensitive implementation, provider, authority, workflow, capability, or publishing changes refresh `README.md` plus the applicable current-state documentation in the same bounded change;
- historical documents or PRs whose facts were once true but are no longer current are explicitly marked historical/superseded or linked to the newer authority instead of silently remaining present-tense guidance;
- the `Documentation Truth` verifier has passed when applicable, and its report is treated as evidence only, never as authority to change the underlying truth;
- no unresolved critical review thread remains;
- privacy, security, brand, IP, credential, and user-data boundaries remain intact;
- rollback or safe forward-fix is understood;
- the merge itself does not silently execute a separately gated action.

## Documentation truth

A merge is a truth transition. Documentation that describes current architecture, authority, provider topology, publication policy, launch state, capability state, or known blockers must not be allowed to remain current by inertia after the underlying state changes.

The repository therefore uses this cycle:

```text
truth-sensitive implementation/provider change
-> update README + applicable current-state docs
-> run Documentation Truth on the exact PR head
-> merge only if repository gates pass
-> run Documentation Truth again on the merged main push
-> if provider/runtime truth changes after merge, update the affected current-state document or mark the prior statement historical before it is reused
```

The post-merge verification is not a second documentation commit requirement. The documentation update belongs in the bounded change that altered the truth. A docs-only truth-sync merge closes the prior drift and does not create an infinite self-update loop; it still receives post-merge verification.

A statement can remain historically true while becoming unsafe as present-tense guidance. Prefer explicit states such as `CURRENT`, `HISTORICAL`, `SUPERSEDED`, `REVALIDATION_REQUIRED`, and `UNKNOWN` over silently editing provenance away.

## Infrastructure outage rule

A GitHub Actions infrastructure outage can gate merge and release truth without proving a code regression.

When jobs have no executed steps or no logs, agents must not blame the diff. They must record the exact PR, head SHA, workflow, run, job evidence, classification, impact, Cloudflare/runtime evidence if available, and the next gate in Founder Control Room.

If remaining evidence is sufficient for a docs-only, policy-only, or otherwise low-risk focused change, a merge may still be appropriate. If the change requires executed CI, Playwright, deployment proof, auth proof, migration proof, runtime proof, or documentation-truth proof that is unavailable because of the outage, leave the PR open and state the exact blocker.

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

After every merge, re-read current `main`, provider/runtime evidence relevant to the change, documentation truth, and the next launch bottleneck. Never carry the old head's green state forward as present-tense authority.
