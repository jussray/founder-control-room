# Founder GitHub Workspace

Founder GitHub Workspace is the Control Room surface for repository read, edit, and write work.

It is intentionally **not** a direct push-to-main editor. It preserves founder control and the L99 proof model:

1. Read project state through `GET /projects/:slug`, `GET /projects/:slug/files`, and `GET /projects/:slug/file`.
2. Edit content in the founder session.
3. Write through `POST /approvals/:missionId/patch`.
4. The patch commits only to that mission's sandbox branch.
5. The patch route re-pins `policy_snapshot.expectedHeadSha` to the new commit so proof gates and terminal evidence attach to the current head.
6. Merge to the base branch still requires the separate proof gate and exact-head execution path.

## What it can do

- Browse a registered project's repository tree at a ref.
- Read a single file from GitHub through the provider abstraction.
- Edit file contents in a founder-authenticated page.
- Create or update repo files by committing a patch to a mission branch.
- Return the branch and commit SHA receipt after a write.

## What it must not become

- A raw GitHub token console.
- A direct main-branch editor.
- A bypass around missions, branch refs, expected head SHA, proof gates, or merge authority.
- A place to paste credentials, service-role keys, session tokens, or private user content.
- A destructive delete UI unless deletion gets its own explicit founder gate and rollback story.

## Operator rule

Use GitHub Workspace for sandbox edits. Use Command Bridge for proof commands. Use the Approval Engine for create-branch and merge execution.

The workspace is a workbench, not a throne. Founder authority stays one layer above every tool.
