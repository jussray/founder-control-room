# Story Engine security and Control Room bridge evidence

Date: 2026-07-24
Authority: Founder Control Room
Repository: `jussray/l99-StoryEngine`

## Operating rule

Founder Control Room is the first evidence ledger while fixes are discovered, implemented, verified, merged, or held. Repository-local results remain inputs. Founder Control Room records the exact PR, branch, head SHA, workflow/job evidence, failure classification, release impact, rollback, and next gate.

## REALITY

### Cookie authentication boundary

Story Engine `main` previously allowed the same API key through two ambient cookie paths:

1. `story-engine/public/l99_auth.js` copied the session key into `document.cookie`.
2. `story-engine/lib/securityContext.js` accepted `l99_api_key` from the request `Cookie` header.

Removing only the browser writer would not have closed the boundary because old or manually planted cookies would still authenticate.

### Control Room status bridge

After the cookie fix, the L99 to Founder Control Room bridge remains incomplete on current `main`:

- `control-room.manifest.json` still identifies the deleted repository `jussray/l99-`.
- `runtime/portfolio_status.py` on the pre-repair main is reduced to a copyright line.
- the existing workflow is manual-only and grants OIDC permission at workflow scope.
- stale PR #18 predates the current `cookie_contract` promotion gate.

## FIX MERGED

Pull request: `jussray/l99-StoryEngine#38`
Branch: `security/cookie-auth-boundary-current-main`
Exact head: `cc132588eeb9a4da6e679ca4e51226b3b23ec521`
Merge commit: `3a6b8ca6be3148876f4e62fac7440b92682b5eec`
Stale source PR closed: `#30`

The merge:

- removed all browser cookie writes for `l99_api_key`;
- removed server cookie parsing and cookie credential fallback;
- preserved explicit `x-api-key` and Bearer authentication;
- preserved role, workspace, scoped-key registry, and existing development legacy-key behavior;
- added cookie-only rejection coverage;
- added mixed-credential coverage proving an administrator cookie cannot replace an explicit lower-privilege header identity;
- added `.security/cookies.json` with zero declared cookies and zero allowed writers;
- added `runtime/cookie_contract.py`;
- added the cookie contract to the canonical promotion registry;
- updated the promotion workflow to verify the immutable PR head.

## PROOF FOR PR #38

Exact-head fallback execution:

- Node authentication tests: 6 passed, 0 failed.
- Valid `x-api-key`: passed.
- Valid Bearer token: passed.
- Valid cookie-only credential: rejected with `401`.
- Explicit viewer header plus administrator cookie: viewer identity preserved.
- Cookie contract: passed.
- JavaScript syntax checks: passed.
- Python compilation for the cookie verifier and promotion wrapper: passed.
- The cookie-rejection regression failed against the pre-patch behavior, proving the test covers the original defect.

Hosted workflow evidence on final head:

| Workflow | Run | Job evidence | Classification |
|---|---:|---|---|
| L99 Promotion Gates | `30134797839` | `steps: null`, no logs | `runner_startup_failure` |
| L99 Story Engine CI | `30134797768` | `steps: null`, no logs | `runner_startup_failure` |
| Guardrails Playwright | `30134797953` | `steps: null`, no logs | `runner_startup_failure` |

A controlled retry of the focused promotion job also failed before runner provisioning. These red receipts remain infrastructure evidence and are not represented as green checks or code regressions.

Playwright was inapplicable to the transport-only authentication boundary because no page layout, route navigation, or visual behavior changed.

## CURRENT HOLD

Pull request: `jussray/l99-StoryEngine#39`
Title: Restore the current-main L99 OIDC status bridge
Branch: `fix/current-main-oidc-status-bridge`
Base: `3a6b8ca6be3148876f4e62fac7440b92682b5eec`
Exact head: `3a494c71fdad648e1f5fff3bffd9e247bf1d7b55`
Changed files: 4

The proposed repair:

- restores the bounded portfolio status exporter;
- binds status to the current full promotion registry, including `cookie_contract`;
- canonicalizes repository identity as `jussray/l99-StoryEngine`;
- adds executable tests for identity, secret rejection, proof-reference safety, exact SHA, timezone, private-content denial, blocked status, and current gate registration;
- verifies immutable PR heads;
- grants `id-token: write` only to the publishing job;
- skips publishing on pull requests;
- restricts publishing to exact `refs/heads/main` push or manual dispatch;
- retains sanitized status artifacts for 14 days.

### Local contract evidence

An isolated reproduction of the exact exporter and test logic with a full eight-gate stub registry passed 9 tests and Python compilation. This proves the exporter contract logic, not the real repository promotion results or external receiver.

### Hosted evidence

| Workflow | Run | Job evidence | Classification |
|---|---:|---|---|
| Publish L99 Control Room Status | `30135161322` | `build-status`: `steps: null`, no logs; `publish` and `enforce-gates` skipped | `runner_startup_failure` |
| Control Room Manifest | `30135161316` | `steps: null`, no logs | `runner_startup_failure` |
| L99 Promotion Gates | `30135161311` | `steps: null`, no logs | `runner_startup_failure` |

Controlled retry job `89617529071` also returned `steps: null` with no logs.

The skipped publish job confirms that pull requests do not request an OIDC token or POST status. It does not prove the exact-main write path.

## FOUNDER CONTROL ROOM DECISION

Status: `HOLD`

Do not merge PR #39 yet.

The write-side receiver contract for `ingest-l99-status` is not discoverable in the current Founder Control Room repository snapshot. The exact accepted GitHub OIDC repository/ref/audience claims therefore remain unverified. Merging PR #39 would trigger a real external status POST from `main`, so construction proof alone is insufficient.

This HOLD is not code blame. The exporter contract currently has positive local evidence, while hosted execution is blocked by runner startup failure and the receiver claim boundary lacks source proof.

## RISK

- Browser-readable session key storage remains a production blocker even though ambient cookie authentication is closed.
- PR #39 may construct a valid envelope but fail at the receiver because claim expectations are unverified.
- A successful POST would still prove only sanitized status ingestion, not Story Engine release readiness, deployment, tenant-safe identity, creator/operator separation, or production behavior.
- Cloudflare evidence was not involved and must remain separate.

## ROLLBACK

- PR #38 can be reverted through merge commit `3a6b8ca6be3148876f4e62fac7440b92682b5eec` if explicit rollback is approved.
- PR #39 is unmerged; rollback is closing or revising the PR. No receiver cleanup is currently required.
- No credential rotation, migration, deployment, publication, DNS change, or destructive write occurred in this evidence workflow.

## NEXT GATE

1. Locate or restore the Founder Control Room receiver source for `ingest-l99-status`.
2. Verify exact OIDC audience, repository, owner, ref, workflow, and environment claim checks.
3. Confirm the canonical project identity mapping between repository `jussray/l99-StoryEngine` and Founder Control Room project slug `l99`.
4. Obtain an executed exact-head PR build-status run or retain the runner outage and reproduce the full real promotion registry locally.
5. Merge PR #39 only when the receiver contract and rollback are proven.
6. After merge, capture the exact-main workflow run, artifact, OIDC POST result, and matching Founder Control Room receipt before closing stale PR #18.
