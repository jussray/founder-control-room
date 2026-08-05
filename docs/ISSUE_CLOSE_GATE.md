# Issue Close Gate

Closing an issue is a separate authority gate. It is not implied by a merge, deployment, comment, passing badge, vendor reply, payment, publication, or verbal approval.

## Purpose

The gate prevents tracked work from disappearing while proof, risk, rollback, or follow-up obligations remain unresolved.

A GitHub issue can be clicked closed before automation runs. The repository workflow therefore verifies the final evidence comment immediately after closure. When evidence is absent, stale, edited after closure, or otherwise invalid, it reopens the issue and posts the exact gate failures.

## Required evidence

The founder must post a fresh comment using [`.github/ISSUE_CLOSE_EVIDENCE.md`](../.github/ISSUE_CLOSE_EVIDENCE.md) with:

- the truthful resolution;
- scope classification;
- exact 40-character repository head, or a reasoned `not_applicable` statement for work with no repository mutation;
- authoritative proof;
- rollback path;
- the next gate;
- `Unresolved risks: none`;
- explicit founder approval.

If the issue was reopened, evidence from the earlier close cycle is invalid. A new evidence comment must be created after the latest reopen. The evidence comment must also be last edited before the current close event so proof cannot be repaired retroactively after the button is clicked.

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
- A branch name, `main`, PR number, abbreviated SHA, or intention is not an exact head.
- Proof may not be `none`.
- Founder approval cannot erase unresolved risks.
- A missing next gate is a blocker, even when the next gate is simply `none`.
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
