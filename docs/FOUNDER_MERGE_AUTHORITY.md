# Founder Merge Authority

## Current founder decision

Juss authorizes repository changes to be merged when the acting AI or operator determines that the merge is appropriate and the evidence supports that conclusion.

This standing authority replaces blanket `do not merge` language in active operating instructions. It does not require another merge-only confirmation when every applicable merge condition below is satisfied.

For Founder Control Room itself, the canonical human authority model is now **founder-final review**:

```text
deterministic independent review
-> exact provider PR/base/head + diff readback
-> authenticated founder final approval of that exact candidate
-> last-moment ref freshness check
-> merge
```

Founder final approval is a separate authority class. It must never be mislabeled as independent semantic review.

## Merge conditions

A merge is appropriate only when:

- the repository, pull request, target branch, and exact head SHA are verified;
- the intended scope is understood and no unrelated work is being smuggled into the change;
- code, configuration, docs, schemas, generated artifacts, and release-impacting changes have been reviewed;
- required checks have genuinely executed and passed, or a documented infrastructure failure has been classified and distinguished from code-test evidence;
- **Quality Gate jobs on pull requests must checkout and verify the exact `github.event.pull_request.head.sha`; GitHub's synthetic PR merge ref is merge-simulation evidence and cannot satisfy exact-head proof for the candidate;**
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

## Independent review + founder-final authority for Founder Control Room merges

The Founder Control Room in-app merge path keeps **independent review load-bearing**, but the canonical FCR policy no longer requires a second human semantic reviewer merely because the founder authored the patch.

For `jussray/founder-control-room` the canonical path requires, at minimum:

- an exact open pull request whose repository, base ref/SHA, head ref/SHA, and author identity match the founder-approved mission;
- a canonical exact diff hash from the provider comparison;
- at least one deterministic independent review receipt with a passed provider-backed witness on the exact head;
- P0/P1 blocked findings and unresolved P2 findings to remain merge-blocking;
- exact-head machine evidence required by the mission;
- an authenticated founder-final receipt bound to the exact PR number, base SHA, head SHA, founder identity, and approval time;
- the founder-final receipt to remain fresh inside the merge proof window;
- the provider PR identity and diff to be re-read after approval;
- the mutable head to be re-read immediately before provider integration; and
- the founder-final policy presented to the evaluator to match the server-owned deterministic founder-final policy.

The canonical founder-final policy is intentionally narrow:

```text
requiredSemanticReviews: 0
requireDeterministicReview: true
blockOnP2: true
trustedSemanticReviewerIds: []
founderFinalApprovalRequired: true
```

A caller cannot turn deterministic review off, weaken P2 handling, substitute model output for founder authority, redefine the policy, or reuse a founder approval against another PR/base/head. The deterministic review receipt itself remains proposal-only and non-authorizing. The authenticated founder-final receipt supplies the final human authority after the independent proof layer passes.

### Deterministic witness production and bootstrap truth

The deterministic-review producer must derive repository, pull request, base/head identity, author, complete diff identity, rule version, findings, verdict, and receipt hash from provider-observed state. A caller cannot supply a trusted reviewer identity, verdict, policy, check conclusion, witness name, or trusted App identity and have that become review authority.

A clear proposal-only receipt may be published as the exact derived `Independent Review / ...` GitHub Check Run only through the repository provider's narrow deterministic-review witness capability. For Founder Control Room production construction, that capability requires the repository-scoped installation credential minted from server-owned `GITHUB_APP_ID` plus `GITHUB_PRIVATE_KEY`; the bounded `GITHUB_TOKEN` local/development fallback must fail closed for deterministic witness publication. After publication, FCR must read the exact-head signal back from GitHub and require the provider-recorded Check Run App issuer to equal the trusted numeric `GITHUB_APP_ID` before treating the witness as current evidence.

Trusted witness ignition must execute from code that is already integrated and running as exact current FCR `main`; candidate-controlled pull-request workflows, candidate preview deployments, stale deployed releases, and PAT-only environments are not trusted witness issuers. The founder-runtime `POST /review/deterministic-witness/:pullRequestNumber` surface is the canonical ignition shape once that code is lawfully integrated, deployed, and re-observed as the exact merged release. It accepts only a positive pull-request number after the existing same-origin, rate-limit, authenticated-founder, and privileged-execution membranes; repository/provider identity remains server-owned; the running full `GIT_SHA` must equal provider-resolved GitHub `main` before witness production and again after publication/reconciliation; the producer returns the complete deterministic receipt; and retry uses reconcile-before-create so an already-existing exact trusted witness is reused rather than blindly duplicated. A default-branch workflow is only an equivalent ignition surface if it preserves those same invariants. The runtime route, any equivalent dispatch workflow, its runner, the deterministic producer/publisher, and the credential-bearing invocation boundary are deterministic-review trust roots and cannot certify their own bootstrap through the normal producer.

Receipt production, Check Run creation, readback, complete receipt handoff, and route success remain non-authorizing on their own. They never supply founder-final, merge, deploy, secret, provider-policy, database, billing, publication, or destructive-action authority. A candidate that changes the deterministic producer, independent-review gate, merge consumer, trusted witness publication boundary, or trusted ignition surface is a trust-root self-modification and must not certify itself through that same producer. Initial trust-root integration remains blocked until the separately explicit, exact-candidate, auditable constitutional authority path in issue #418 is invoked; ordinary `approved`, `cont`, machine green, mergeability, model review, or bypass capability do not invoke that exception.

### Legacy pinned semantic-review missions

Missions already approved under the earlier server-owned semantic-review policy may continue to validate that pinned policy for compatibility. In that historical mode, `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS` remains the server-owned trusted semantic reviewer set and author self-review still cannot satisfy independent semantic review.

New canonical FCR founder-final approvals do **not** depend on `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS`. Do not revive that environment variable as a requirement for the founder-final path.

### In-app FCR authority is not the live GitHub ruleset

The source/runtime FCR merge membrane and the **live GitHub repository ruleset are a separate provider gate**.

A correct in-app founder-final review engine does not prove that GitHub's web/API merge surface independently enforces the same approval count, stale-review dismissal, last-push approval, thread resolution, strict status freshness, bypass actors, or bypass modes. Those provider protections require their own current GitHub readback.

Do not claim repository-wide GitHub governance is fixed merely because the FCR source gate is strong. Conversely, a GitHub merge that occurred outside the in-app FCR path does not prove the in-app deterministic-review + founder-final contract was satisfied.

## Documentation truth

A merge is a truth transition. Documentation that describes current architecture, authority, provider topology, publication policy, capability state, launch state, or blockers must not remain current by inertia after the underlying state changes.

For a truth-sensitive change:

```text
implementation / authority / provider truth changes
-> update README + applicable current-state docs in the same bounded PR
-> run Documentation Truth on the exact PR head
-> merge only with the normal repository gates satisfied
-> run Documentation Truth again on the merged main transition
-> re-observe provider/runtime truth before reusing present-tense claims
```

Default test discovery has a distinct proof boundary: an exclusion ledger only says a candidate test is absent from the default suite. It must be base-bound, cannot grow in a candidate PR, and must shrink when the excluded path is repaired or removed; it never proves universal CI non-execution.

Historical evidence stays useful. Mark older contradictory material `HISTORICAL`, `SUPERSEDED`, `REVALIDATION_REQUIRED`, or otherwise point it to the newer authority instead of deleting provenance or letting old present-tense guidance compete silently with current truth.

A docs-only truth-sync merge closes an earlier drift cycle. Its post-merge Documentation Truth receipt closes that transition and does not create an infinite requirement to rewrite the docs again merely because the merge commit SHA changed.

## Infrastructure outage rule

A GitHub Actions infrastructure outage can gate merge and release truth without proving a code regression.

When jobs have no executed steps or no logs, agents must not blame the diff. They must record the exact PR, head SHA, workflow, run, job evidence, classification, impact, Cloudflare/runtime evidence if available, and the next gate in Founder Control Room.

If remaining evidence is sufficient for a docs-only, policy-only, or otherwise low-risk focused change, a merge may still be appropriate only when every other applicable authority gate is satisfied. If the change requires executed CI, deterministic review, Playwright, deployment proof, auth proof, migration proof, runtime proof, or Documentation Truth proof that is unavailable, leave the PR open and state the exact blocker.

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

Do not merge merely because a PR exists or because a badge looks green. Merge when it is the correct, evidence-backed integration step and the current authority membrane is satisfied.

Immediately before merge, re-read current `main`, the exact PR head, required checks, review state, founder-final receipt state, and applicable provider state. After merge, re-read the resulting `main`, Documentation Truth, and the next release/runtime gate. Old-head green remains historical evidence only.
