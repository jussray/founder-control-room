# Guarded Local Workspace Runbook

Version: `1.1.0`

Founder Control Room can continue storefront verification without private GitHub-hosted runners only when a reviewed local workspace exists. This workspace is not stored in the public Control Room repository. It is a local sibling directory tree containing exact private checkouts.

## Authority boundary

This runbook authorizes verification setup only. It does not authorize merge, deployment, pricing, outreach, spending, checkout, refunds, customer communication, vendor access, customer data access, credential access, or making private repositories public.

No approval carries forward. Dependency setup, Playwright package setup, Playwright browser setup, verification commands, merge, deploy, and rollback remain separate founder-gated actions.

## Required layout

Set `CONTROL_ROOM_WORKSPACE_ROOT` to an absolute path containing these sibling checkouts:

```text
<workspace-root>/founder-control-room
<workspace-root>/jbh-private
<workspace-root>/jussbeautifulhair-site
<workspace-root>/untold-stories-storefront
```

Private repositories must never be copied or nested into `<workspace-root>/founder-control-room`. The public Control Room repository may reference private checkout paths through `CONTROL_ROOM_WORKSPACE_ROOT`, but it must not contain private source, credentials, customer data, vendor records, Shopify data, or unpublished story material.

## Exact mission targets

The current storefront missions are bound to these immutable targets:

| Project | Mission | PR | Branch | Expected SHA | Evidence state |
|---|---|---:|---|---|---|
| `juss-beautiful-hair-private` | `ae933e98-ec1d-4a94-b9de-804c4fa78ab8` | `38` | `fix/private-security-exact-head` | `a8a4c4fd892f78ba8d6f239598fbe93cef80b7ca` | `runner_startup_failure`; no mission evidence imported |
| `juss-beautiful-hair` | `887083a2-e347-4b5f-9f11-758117752c46` | `32` | `fix/paid-order-reconciliation` | `3a9f67c810fab470f4158b5f847b19a25a5b021f` | exact-head required checks passed and evidence imported |
| `untold-stories` | `07e07483-cb88-4ac5-9952-32fbb051f8d5` | `29` | `fix/hydrogen-build-baseline-current-main` | `ce86a74d7d6e3bc8238d1131d79d5b57c3911518` | exact-head required checks passed and evidence imported |

Private PR #38 remains draft and must stay `sandboxed` until a genuine exact-head job executes with real steps and logs. The current failed run created no jobs and is infrastructure evidence, not a code regression.

Public PR #32 and Untold PR #29 are the reviewed successor proof carriers. Untold PR #17 is retired and must not be reopened, targeted, or used as evidence.

If a target head moves, do not reuse this workspace as proof. Update the Control Room mission through a reviewed exact-head reconciliation first. Never copy evidence from a previous head.

## Preflight

Run this from the Control Room checkout:

```bash
CONTROL_ROOM_WORKSPACE_ROOT=/absolute/path/to/workspace \
  npm run verify:local-workspace
```

The verifier checks:

- `CONTROL_ROOM_WORKSPACE_ROOT` is absolute and readable;
- all four required checkout directories exist;
- each checkout resolves inside the workspace root;
- private checkout directories are not nested inside the public Control Room repository;
- each checkout is a Git repository at its own top-level root;
- each remote matches the expected `jussray/*` repository;
- each mission checkout HEAD equals the exact mission SHA;
- every checkout is clean before terminal evidence begins.

A passing preflight is not mission evidence by itself. It only proves the local workspace is safe enough to start guarded terminal commands.

## Terminal settings

Use loopback only:

```env
CONTROL_ROOM_TERMINAL_ENABLED=true
CONTROL_ROOM_TERMINAL_ALLOW_REMOTE=false
CONTROL_ROOM_WORKSPACE_ROOT=/absolute/path/to/workspace
```

The terminal remains disabled by default and must not be exposed remotely.

## Command order per mission

Run only fixed allowlisted command IDs through the authenticated terminal API:

1. `git.head`
2. `git.status`
3. `deps.install` with `confirmWrite: true`
4. `deps.playwright-package` with `confirmWrite: true`
5. `deps.playwright-browser` with `confirmWrite: true`
6. `verify.ai-skills`
7. project-specific security, type, lint, unit, build, and browser commands

Every terminal run must bind `expectedCommitSha` to the mission SHA. `output_truncated=true` is warning evidence and cannot satisfy the proof gate.

## Completion rules

A mission stays `sandboxed` until every required evidence kind has a latest `pass` row at the exact SHA:

- `artifact_provenance` for `/sales` and `/devil` contract proof;
- `security_scan` for repository and deployment boundaries;
- `typecheck`;
- `lint` and `unit_test` where required;
- `integration_test` for build;
- `browser_test` for desktop/mobile Playwright and negative cross-catalog checks.

Let `MissionController` advance the mission to `in_review`. Do not update status manually to manufacture progress.

## Rollback

If the local workspace is wrong, dirty, stale, nested, or contains unexpected private material, stop before terminal execution. Fix the workspace outside the repository, rerun preflight, and preserve the failed preflight output as non-proof diagnostic context. Do not delete Control Room evidence rows.

To reverse this target reconciliation, restore the previous mission target fields through a guarded transaction, preserve all evidence and reconciliation history, and revert the repository contract commit. Do not delete evidence rows as rollback.
