# Issue Close Gate

Closing an issue is a separate authority gate. It is not implied by a merge, deployment, comment, passing badge, vendor reply, payment, publication, or verbal approval.

## Purpose

The gate prevents tracked work from disappearing while proof, risk, rollback, or follow-up obligations remain unresolved.

A GitHub issue can be clicked closed before automation runs. The repository workflow therefore verifies the final evidence comment immediately after closure. When evidence is absent or invalid, it reopens the issue and posts the exact gate failures.

## Required evidence

The founder must post a comment using [`.github/ISSUE_CLOSE_EVIDENCE.md`](../.github/ISSUE_CLOSE_EVIDENCE.md) with:

- the truthful resolution;
- scope classification;
- exact 40-character repository head, or a reasoned `not_applicable` statement for work with no repository mutation;
- authoritative proof;
- rollback path;
- the next gate;
- `Unresolved risks: none`;
- explicit founder approval.

## Fail-closed rules

- Only the configured founder login may submit closure evidence.
- Evidence from an untrusted repository association is rejected.
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

The reusable action lives at `.github/actions/issue-close-gate/`. Active portfolio repositories should invoke the action from an `issues.closed` workflow pinned to a reviewed Founder Control Room commit. Quarantined or duplicate repositories remain read-only and must not receive rollout commits.

## Rollback

Disable or revert the repository's issue-close workflow and remove `close-issue` from the approval-gate list. Do not delete gate comments or closure evidence; preserve the audit trail.
