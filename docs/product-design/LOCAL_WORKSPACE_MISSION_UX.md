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

### `workflow_no_runs`

A pull request has no workflow runs for the current exact head.

Copy: `No workflow run exists for this head. This is not proof and cannot be merged as verified.`

Disabled actions: merge, deploy, mark in review.

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

Show root status without exposing secret-bearing paths in public screenshots. Display check names, pass/fail state, and the exact checkout directory names. Show `private repos are siblings` as its own row.

### Evidence matrix

Rows are evidence kinds. Columns are required, latest status, exact SHA, source, run ID, output truncation, and last checked. A row cannot pass when `output_truncated=true`.

### Action rail

Separate actions into setup, verification, review, merge, and deploy. Only one rail can be active at a time. Do not style disabled merge/deploy buttons as available.

## Copy rules

Use `not proof` anywhere workspace-ready is shown. Use `not a code failure` anywhere `steps: null` is shown. Use `separate founder gate` on merge and deploy surfaces.

## Accessibility rules

- Status changes use `aria-live="polite"`.
- Do not rely on color alone for blocked, warning, or passed states.
- Keyboard focus order must follow identity, runner status, workspace status, evidence, then actions.
- Error summaries link to the failed row or command.
- Reduced-motion users should not receive animated progress spinners without a static status label.

## Done contract

The mission UI is done only when it prevents these false conclusions:

1. preflight passed, therefore mission is proved;
2. GitHub `steps: null`, therefore code failed;
3. exact-head evidence complete, therefore deploy is approved;
4. founder login, therefore execution is authorized;
5. one storefront mission passed, therefore every storefront passed.
