# Issue Close Gate

Closing an issue is a separate authority gate. It is not implied by a merge, deployment, comment, passing badge, vendor reply, payment, publication, or verbal approval.

## Purpose

The gate prevents tracked work from disappearing while proof, risk, rollback, or follow-up obligations remain unresolved.

A GitHub issue can be clicked closed before automation runs. The repository workflow therefore verifies the final evidence comment immediately after closure. When evidence is absent, stale, edited after closure, or otherwise invalid, it reopens the issue and posts the exact gate failures.

## Required evidence

The founder must post a fresh comment using [`.github/ISSUE_CLOSE_EVIDENCE.md`](../.github/ISSUE_CLOSE_EVIDENCE.md) with:

- the truthful resolution;
- scope classification;
- an exact 40-character repository head integrated into the default branch for code or documentation work, or a reasoned `not_applicable` statement for operational or non-code work with no repository mutation;
- authoritative proof;
- rollback path;
- the next gate;
- `Unresolved risks: none`;
- explicit founder approval.

If the issue was reopened, evidence from the earlier close cycle is invalid. A new evidence comment must be created after the latest reopen. The evidence comment must also be last edited before the current close event so proof cannot be repaired retroactively after the button is clicked.

The gate selects the latest fresh founder-authored evidence comment. A later evidence-shaped comment from another author cannot shadow valid founder evidence.

## Repository-head verification

For `code` and `docs` scope, a syntactically valid SHA is not enough. The action reads the repository default branch and verifies that the supplied commit is identical to, or an ancestor of, that branch. A commit from another repository, an unmerged branch, a fabricated SHA, an abbreviated SHA, a branch name, or `not_applicable` fails the closure gate.

Operational and non-code scope may use `not_applicable: <specific reason>` only when no repository mutation exists. They may still provide a real integrated SHA when the operation included repository changes.

## Close-cycle isolation

Each workflow run is bound to the exact `closed_at` timestamp from its event. The action reads the issue before and immediately before mutation. If the issue is open or its current close timestamp differs, the run is stale and exits without reopening, commenting, or otherwise mutating the newer closure cycle.

This protects a valid newer closure from delayed jobs or manual reruns of an older event.

## Visible outcomes

A failed gate reopens the issue and posts the precise missing or invalid fields.

A passing gate leaves the issue closed and posts one idempotent receipt containing:

- repository and issue number;
- close timestamp;
- evidence comment ID and author;
- evidence creation and last-edit timestamps;
- SHA-256 hash of the evidence body.

The receipt does not copy raw evidence text. It is a durable witness for the gate decision, not a claim that deployment, production, provider, database, browser, device, payment, publication, or another separately gated state passed.

## Fail-closed rules

- Only the configured founder login may submit closure evidence.
- Evidence from an untrusted repository association is rejected.
- Evidence must be created after the latest reopen and last edited no later than the current close timestamp.
- Code and documentation closure requires an integrated default-branch commit SHA.
- A branch name, `main`, PR number, abbreviated SHA, unmerged commit, fabricated SHA, or intention is not an exact head.
- Proof may not be `none`.
- Founder approval cannot erase unresolved risks.
- A missing next gate is a blocker, even when the next gate is simply `none`.
- Stale workflow reruns do not mutate a newer close cycle.
- Pull requests are excluded because PR closure and merge authority have separate controls.

## Control Room integration

`close-issue` is a first-class `ApprovalGateId` in `src/proof-gate/types.ts`.

The Control Room proof gate requires:

- `issueReference`;
- `resolution`;
- `nextGate`;
- explicit founder approval;
- zero unresolved risks;
- the standard scope, checks, rollback, and failure evidence.

Manual proof-gate attestation remains evidence, not CI verification. GitHub workflow evidence and any runtime, browser, device, provider, database, or production witnesses remain separate proof layers.

## Portfolio rollout

The reusable action lives at `.github/actions/issue-close-gate/`. Active portfolio repositories should invoke the action from an `issues.closed` workflow pinned to a reviewed Founder Control Room commit and pass `github.event.issue.closed_at`. Quarantined or duplicate repositories remain read-only and must not receive rollout commits.

## Rollback

Disable or revert the repository's issue-close workflow and remove `close-issue` from the approval-gate list. Do not delete gate comments or closure evidence; preserve the audit trail.
