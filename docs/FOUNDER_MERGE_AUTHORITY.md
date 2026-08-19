# Founder Merge Authority

## Current founder decision

Juss authorizes repository changes to be merged when the acting AI or operator determines that the merge is appropriate and the evidence supports that conclusion.

This standing authority replaces blanket `do not merge` language in active operating instructions. It does not require another merge-only confirmation when every applicable merge condition below is satisfied.

For `jussray/founder-control-room`, the normal merge path remains independent-review-first. The founder also retains a separate, explicit, auditable manual-merge override described below. Ordinary words such as `approved`, `merge`, `continue`, `cont`, or `audit` do not by themselves invoke that exception.

## Merge conditions

A merge is appropriate only when:

- the repository, pull request, target branch, and exact head SHA are verified;
- the intended scope is understood and no unrelated work is being smuggled into the change;
- code, configuration, docs, schemas, generated artifacts, and release-impacting changes have been reviewed;
- required checks have genuinely executed and passed, or a documented infrastructure failure has been classified and distinguished from code-test evidence;
- FCR `Required Gate` includes the secret-free exact-head Cloudflare bridge authority contract, and that dependency must succeed whenever the required gate is used; live Cloudflare/GitHub provider state remains separate evidence;
- zero-step/no-log GitHub Actions failures are classified as `runner_startup_failure` or `workflow_no_jobs`, not as code regressions;
- a `workflow_step_failure` is not waved away as infrastructure when logs show a real failing command, assertion, build, type, lint, or Playwright step;
- Playwright has passed for any changed user-facing web/runtime path, or is explicitly inapplicable;
- Founder Control Room release-truth evidence has been checked when the change affects release, deployment, cross-repo coordination, or incident interpretation;
- Cloudflare build/deploy evidence has been checked when Cloudflare is part of the release path, while keeping Cloudflare truth separate from GitHub Actions truth;
- **Documentation truth** has been reconciled for truth-sensitive architecture, authority, provider, publishing, capability, workflow, or launch changes;
- no unresolved critical review thread remains;
- privacy, security, brand, IP, credential, sauce, and user-data boundaries remain intact;
- rollback or safe forward-fix is understood;
- the merge itself does not silently execute a separately gated action.

## Independent review for Founder Control Room merges

The Founder Control Room in-app merge path has an additional load-bearing independent-review membrane before repository provider integration.

For `jussray/founder-control-room` it requires, at minimum:

- an exact open, non-draft pull request whose repository, base ref/SHA, head ref/SHA, and author identity match the founder-approved mission;
- a canonical exact diff hash from the provider comparison;
- a deterministic review witness on the exact head;
- at least one trusted non-author semantic review on the exact head;
- P2 findings to remain merge-blocking;
- provider-backed review signals and receipt hashes to match the submitted review evidence;
- the mutable head to be re-read immediately before provider integration; and
- the review policy presented to the evaluator to match the **server-owned** reviewer trust configured through `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS`.

The request may carry review metadata or a pinned policy representation for identity/hashing, but it cannot redefine the trusted semantic reviewer set. The evaluator fails closed when the policy hash differs from the server-owned FCR reviewer policy, when the server configuration is absent or invalid, when the reviewer is the author, when a GitHub App bot is offered as the semantic reviewer, or when the provider witness is stale or mismatched.

### Explicit founder manual-merge override

The founder retains final manual merge authority as a deliberately separate exception path. This exception does **not** redefine a founder self-review as an independent approval and does **not** make the ordinary independent-review path optional.

A founder override is valid only when the founder explicitly invokes the exception for the exact candidate being merged and an auditable receipt records, before or contemporaneously with the merge:

- repository and pull request number;
- target branch and current base SHA;
- exact final head SHA;
- founder identity;
- explicit `FOUNDER_MANUAL_MERGE_OVERRIDE` authority class;
- reason the normal independent-review path is being overridden;
- current machine-check state, including every non-green or unavailable required signal;
- current review and unresolved-thread state;
- current provider/ruleset truth, classified `CURRENT`, `UNKNOWN`, or `BLOCKED` rather than guessed;
- rollback or safe forward-fix;
- timestamp and durable receipt/provenance location.

The override must fail closed when the head or base changes after the receipt is prepared. It cannot silently authorize a deployment, publication, provider-policy mutation, secret/credential change, database mutation, destructive action, billing commitment, or other separately gated side effect.

A founder override may acknowledge a known provider-governance gap; it must not relabel that gap as fixed. Historical founder-executed merges without this explicit receipt remain historical governance evidence, not retroactive compliant overrides.

### In-app FCR authority is not the live GitHub ruleset

The source/runtime FCR merge membrane and the **live GitHub repository ruleset are a separate provider gate**.

A correct in-app review engine does not prove that GitHub's web/API merge surface independently enforces the same approval count, stale-review dismissal, last-push approval, thread resolution, strict status freshness, bypass actors, or bypass modes. Those provider protections require their own current GitHub readback.

Do not claim repository-wide GitHub governance is fixed merely because the FCR source gate is strong. Conversely, a GitHub merge that occurred outside the in-app FCR path does not prove the in-app independent-review contract was satisfied.

The explicit founder manual-merge override is an exception to the normal merge authorization path, not evidence that the live provider ruleset enforces the normal path. Provider enforcement and founder exception authority must remain separately observable.

## Documentation truth

A merge is a truth transition. Documentation that describes current architecture, authority, provider topology, publication policy, capability state, launch state, or blockers must not remain current by inertia after the underlying state changes.

For a truth-sensitive change:

```text
implementation / authority / provider truth changes
-> update README + applicable current-state docs in the same bounded PR
-> run Documentation Truth on the exact PR head
-> merge only with the normal repository gates satisfied or an explicit founder manual-merge override receipt
-> run Documentation Truth again on the merged main transition
-> re-observe provider/runtime truth before reusing present-tense claims
```

Historical evidence stays useful. Mark older contradictory material `HISTORICAL`, `SUPERSEDED`, `REVALIDATION_REQUIRED`, or otherwise point it to the newer authority instead of deleting provenance or letting old present-tense guidance compete silently with current truth.

A docs-only truth-sync merge closes an earlier drift cycle. Its post-merge Documentation Truth receipt closes that transition and does not create an infinite requirement to rewrite the docs again merely because the merge commit SHA changed.

## Infrastructure outage rule

A GitHub Actions infrastructure outage can gate merge and release truth without proving a code regression.

When jobs have no executed steps or no logs, agents must not blame the diff. They must record the exact PR, head SHA, workflow, run, job evidence, classification, impact, Cloudflare/runtime evidence if available, and the next gate in Founder Control Room.

If remaining evidence is sufficient for a docs-only, policy-only, or otherwise low-risk focused change, a merge may still be appropriate only when every other applicable authority gate is satisfied or the founder explicitly invokes the manual-merge override with the required receipt. If the change requires executed CI, independent review, Playwright, deployment proof, auth proof, migration proof, runtime proof, or Documentation Truth proof that is unavailable, leave the PR open unless the explicit override is valid for that exact merge and the missing evidence is recorded rather than treated as green.

## Canonical project routing

Only `jussray/Sekret-Bip` is the active Se’kret Bip working repository. Other Bip-named repositories are historical or investigate-only unless Founder Control Room explicitly names one for provenance capture.

## Separate gates remain separate

This standing merge authority and the founder manual-merge override do not automatically authorize:

- production deployment or public release;
- database migration or destructive data writes;
- authentication, authorization, allowlist, RLS, credential, or secret changes;
- spending, billing, plan upgrades, paid infrastructure, or commercial commitments;
- DNS, domain, provider-ownership, or production-routing changes;
- account creation, deletion, distribution, publication, or external communication;
- deletion of branches, files, records, history, or user material.

Those actions still require their own exact approval unless a later founder directive explicitly grants standing authority for that category.

## Operating rule

Do not merge merely because a PR exists or because a badge looks green. Merge when it is the correct, evidence-backed integration step and either the normal current authority membrane is satisfied or the founder has explicitly invoked the exact-candidate manual-merge override with its required receipt.

Immediately before merge, re-read current `main`, the exact PR head, required checks, review state, and applicable provider state. After merge, re-read the resulting `main`, Documentation Truth, and the next release/runtime gate. Old-head green remains historical evidence only.
