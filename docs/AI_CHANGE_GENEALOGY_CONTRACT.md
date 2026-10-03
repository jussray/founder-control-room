# AI Change Genealogy Contract

Status: active Founder Control Room audit doctrine.

This contract governs repository-change audits performed by Founder Control Room, Chief AI, the Founder AI Council, and every participating AI operator. It deepens existing TruthMode / Confess, exact-head, authority, rollback, and proof contracts. It does not create merge, deploy, publication, provider-mutation, credential, billing, database, or founder authority.

## Why this exists

A pull request is a container, not a single event. A green PR summary can hide an earlier causal commit, a later partial reversal, a stale review, a direct-to-default-branch write, or a squash/merge boundary that changes what actually entered the authoritative branch.

Audits therefore inspect change genealogy before treating the current symptom as the root cause.

## Default recent-change window

For a repository audit, start narrow with this semantic request:

```json
{
  "repository_full_name": "<authoritative owner/repo>",
  "limit": 10,
  "include_comments": true,
  "include_diff": true
}
```

`limit: 10` means the ten most recent pull requests in the audit window. It does not mean ten comments or ten commits.

Ten is a default evidence window, not a truth boundary. Expand only when the observed causal chain starts before the window, a referenced predecessor lies outside it, or a direct/default-branch commit cannot be explained from the window.

## Required genealogy for each pull request

Index every commit in each returned PR before deciding where the defect lives.

For every commit preserve, when provider evidence exposes it:

- full commit SHA
- parent SHA(s)
- commit message
- provider author identity without exposing private email
- authored/committed time
- PR membership
- whether it is the PR head, predecessor, merge commit, squash source, or superseded intermediate state
- changed-file summary when collected
- exact-head checks/reviews when they are load-bearing

Do not require every historical intermediate commit to have been independently production-ready. Historical commits explain evolution. The final candidate and the commit that actually entered the authoritative branch own the current proof burden.

## Diff and comment collection

`include_diff: true` means collect enough diff evidence to establish scope and genealogy. Default remote/audit responses should return bounded file-level change summaries and fingerprints rather than raw patch bodies. Raw patches may be inspected internally when necessary for a focused diagnosis but must not be copied into long-lived receipts by default.

`include_comments: true` means collect bounded PR conversation, review, and review-comment evidence needed to understand objections, failed approaches, supersession, unresolved findings, and exact-head review freshness.

Comments are evidence, not authority. A reviewer or model statement cannot make stale code current, turn a failed check green, or mint founder approval.

## Direct-to-default-branch commits

The audit window must also inspect recent commits on the authoritative default branch and map them back to associated PRs when the provider can prove that relationship.

Classify each branch commit as one of:

- `associated_pr`: provider evidence links the commit to one or more PRs
- `direct_candidate`: no associated PR is visible and the commit is a normal single-parent branch commit
- `unattributed_merge`: merge-shaped history exists but provider association is incomplete
- `unknown`: collection is incomplete or contradictory

Never call a commit "direct to main" from message text alone.

## Squash and merge boundaries

Preserve both histories when GitHub or another provider exposes them:

```text
PR branch: A -> B -> C -> D
                    |
                    | squash / merge
                    v
default branch:     S
```

`A/B/C/D` explain how the change evolved. `S` is what actually entered the authoritative branch when squash merging is used.

Do not donate CI, review, runtime, or browser proof from `D` to `S` unless the repository's proof contract explicitly binds that evidence across the boundary.

## Causal audit order

Use this order for software/repository audits:

```text
authoritative repository + default branch
        -> current exact head
        -> recent 10 PR window
        -> comments + bounded diff evidence
        -> every PR commit identity
        -> direct/default-branch commit scan
        -> suspicious lineage expansion
        -> exact candidate/head checks
        -> provider/runtime/database truth when load-bearing
        -> Playwright/browser proof for user-facing behavior
        -> outcome receipt
```

The recent window is a rear-view mirror, not a substitute for current exact-head or runtime proof.

## Separate failure receipts

Never collapse distinct failures into one red/green status.

Every independent failure or evidence gap keeps its own receipt containing at least:

- receipt/fingerprint identity
- repository
- PR and/or commit when applicable
- evidence scope
- classification
- observed time
- current/historical/stale/unknown state
- causal relationship if proven
- rollback or next verification gate when applicable

Examples that remain separate:

- stale review approval
- required check failure
- required check still pending
- branch head moved during collection
- live base moved during collection
- comments truncated
- commit history truncated
- direct-branch attribution incomplete
- runtime identity unknown
- Playwright failure
- database/provider readback failure

One passing layer cannot erase another failing receipt.

## Truth and freshness

Provider state is mutable. Re-read the authoritative default branch and exact candidate at consequential boundaries.

Base/head movement expires predecessor exact-head CI, semantic review, browser, runtime, and provider evidence unless a stronger repository contract explicitly proves continuity.

Historical proof remains provenance. It is not current authorization.

## All-AI participation rule

Every AI matters, but roles do not collapse into one undifferentiated super-agent.

Current named participants include:

- ChatGPT / Codex
- Claude / Claude Code
- Muse / Meta AI platform
- Gemini / Google AI platform
- Perplexity
- DeepSeek Instructor / DeepSeek platform
- Chief AI and Founder Control Room orchestration
- local or future models admitted by the governed registry

Each operator may research, propose, challenge, review, or implement only within its registry capability and current authority ceiling. Platform/model availability alone does not create an operator seat or mutation authority.

No provider is automatically privileged as the source of truth. Task routing should use fresh local evidence, task-class fit, cost/duration, proof quality, false-green history, and authority-boundary performance. Preserve meaningful dissent across provider families.

DeepSeek Instructor remains an instruction/adversarial lane unless a separately reviewed contract grants a different capability. Muse is a first-class Council/operator participant. Gemini, Codex/ChatGPT, Claude, Perplexity, Muse, DeepSeek, and later eligible models all inherit this genealogy contract when auditing repository change.

## Council use

Parallel reasoning is allowed. Mutation remains serialized.

A Council audit may distribute work across models, for example:

- one operator reconstructs commit lineage
- one inspects comments/reviews
- one challenges causal attribution
- one verifies current exact-head checks
- one verifies provider/runtime behavior

The synthesis must preserve model disagreement and evidence provenance. Model consensus is not evidence and cannot overrule repository/provider/runtime truth.

## Token and latency discipline

Index broadly, expand narrowly.

Default behavior:

1. inspect ten recent PRs
2. index every commit identity in those PRs
3. collect bounded comments and file summaries
4. identify suspicious commits or lineage gaps
5. fetch full commit/file detail only for the suspicious subset
6. escalate to CI/provider/runtime/browser evidence only where load-bearing

Do not fetch hundreds of raw patches simply because they exist.

## Required audit output

Return:

- `REALITY`: current verified state
- `GENEALOGY`: PR -> commit -> merge/default-branch lineage and direct-branch candidates
- `FIX`: smallest reversible repair selected from the causal evidence
- `PROOF`: exact-head tests/checks/provider/runtime/browser evidence
- `RISK`: unresolved receipts and unknowns
- `ROLLBACK`: safe reversal
- `NEXT GATE`: one exact founder decision or next action

## Non-authority boundary

Genealogy fingerprints, comments, diffs, commit SHAs, model conclusions, review approvals, proof cookies, and Council votes are evidence only. None of them grants merge, deploy, publication, provider mutation, secret access, billing/spend, database mutation, deletion, or founder authority.