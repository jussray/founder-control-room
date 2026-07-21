# Local Workspace Mission UX Spec

## Purpose

Define the Founder Control Room UI rules for using a reviewed local workspace when private GitHub-hosted runners fail before checkout.

The UI must never imply that workspace setup equals mission proof. A workspace only makes terminal verification possible. Proof exists only after allowlisted terminal commands create exact-head, non-truncated evidence rows for the same mission.

## Product principle

Use a cockpit, not a wizard. A wizard implies each next button advances authority. A cockpit shows state, interlocks, missing proof, and separate founder gates.

## Required states

### `runner_blocked`

Private GitHub Actions jobs exist but end before checkout with no steps or logs.

Copy: `Private hosted runners have not produced executable evidence yet. This is not a code failure.`

Disabled actions: merge, deploy, mark in review, record manual pass.

### `workspace_missing`

No reviewed `CONTROL_ROOM_WORKSPACE_ROOT` has passed preflight.

Copy: `No reviewed local workspace is available. Create sibling checkouts outside the public Control Room repository before terminal verification.`

Disabled actions: run terminal command, merge, deploy, mark in review.

### `workspace_preflight_failed`

The local workspace verifier failed.

Copy: `Workspace preflight failed. Terminal evidence is blocked until every checkout is clean, sibling-scoped, and exact-head bound.`

Show each failed check. Do not hide warnings.

### `workspace_ready`

Preflight passed, but mission evidence is still missing.

Copy: `Workspace is ready. This is not mission proof. Run allowlisted commands to create evidence.`

Disabled actions: merge, deploy, mark in review.

### `dependency_setup_required`

A write-risk setup command is required.

Copy: `Dependency setup changes the local workspace. It requires separate founder confirmation and does not authorize verification, merge, or deployment.`

### `verification_running`

A terminal command is active.

Copy: `Verification is running. One terminal command per project may run at a time.`

Disable every other command for that project.

### `evidence_incomplete`

Some evidence exists, but at least one required kind is missing, stale, failed, warning-only, or truncated.

Copy: `Evidence is incomplete. Missing checks cannot be inferred from passed checks.`

### `evidence_complete`

Every required evidence kind has a latest exact-head pass row for the same mission.

Copy: `Exact-head evidence is complete. Founder merge approval is still separate.`

Disabled actions: deploy, pricing, outreach, customer data access, vendor access.

### `mission_in_review`

MissionController advanced the mission after complete proof.

Copy: `Mission is in review. Recheck the immutable PR head immediately before any merge reservation.`

## Screen anatomy

### Mission identity card

Show project name, repository, PR number, mission ID, branch ref, expected SHA, current PR head, and head-match result. Use monospace for SHAs and mission IDs. Use a red mismatch state when current head differs from mission expected SHA.

### Private runner status card

Show latest workflow run IDs, job IDs, whether any job has real steps, whether checkout executed, and classification: `workflow_no_runs`, `runner_startup_failure`, or `workflow_step_failure`.

Never label `steps: null` as a code failure.

### Workspace preflight card

Show root status without exposing secret-bearing path segments, required checkout directories, expected SHA per checkout, clean tree status, and private-source containment status.

Preflight pass badge: `Workspace ready, proof not started`.

### Command plan card

Show fixed order:

1. `git.head`
2. `git.status`
3. `deps.install`
4. `deps.playwright-package`
5. `deps.playwright-browser`
6. `verify.ai-skills`
7. repository-specific security/type/lint/unit/build/browser commands

Write-risk commands must show: `Separate approval required`.

### Evidence ledger card

Each row shows evidence kind, status, command ID, terminal run ID, expected SHA, observed SHA, output truncated yes/no, start time, and finish time.

A row is proof-eligible only when status is pass, expected SHA equals observed SHA, output is not truncated, command kind matches a required evidence kind, and row belongs to the same mission.

### Non-authorizations card

Always show:

`This flow does not authorize merge, deployment, pricing, outreach, spending, checkout changes, refunds, customer communication, vendor access, customer data access, credential access, or making private repositories public.`

## Accessibility rules

- Do not use color alone for proof state.
- Every disabled action needs visible reason text.
- Copy buttons must never include secrets or service-role keys.
- Terminal output previews must be redacted and bounded.
- Use plain labels: missing, blocked, running, failed, passed, stale, warning.

## Done

This product design layer is complete when the Control Room UI can explain the local workspace fallback without overclaiming proof, hiding privacy risks, or collapsing founder gates.