# Story Engine security and Control Room bridge evidence

Date: 2026-07-24
Authority: Founder Control Room
Repository: `jussray/l99-StoryEngine`

## Operating rule

Founder Control Room is the first evidence ledger while fixes are discovered, implemented, verified, merged, held, superseded, or rolled back. Repository-local results remain inputs. Founder Control Room records the exact PR, branch, head SHA, workflow/job evidence, failure classification, release impact, rollback, and next gate.

## REALITY

### Cookie authentication boundary

Story Engine `main` previously allowed the same API key through two ambient cookie paths:

1. `story-engine/public/l99_auth.js` copied the session key into `document.cookie`.
2. `story-engine/lib/securityContext.js` accepted `l99_api_key` from the request `Cookie` header.

Removing only the browser writer would not have closed the boundary because old or manually planted cookies would still authenticate.

### Control Room integration architecture

Two historical integration paths exist:

- closed Founder Control Room PR #11 implemented a direct L99-only GitHub OIDC observer at `ingest-l99-status`;
- merged Founder Control Room PR #21 intentionally superseded that observer with provider-neutral repository federation and signed runner-packet ingestion.

PR #11 was closed specifically because retaining the direct observer would create a second observation path and duplicate evidence semantics. Its receiver contract is useful historical proof of accepted claims, but it is not the canonical integration path.

Current canonical routing is:

```text
jussray/l99-StoryEngine
→ .control-room/repository.manifest.json
→ provider-neutral repository verification / signed runner packet
→ Founder Control Room evidence and findings
```

The Founder Control Room project mapping is already explicit on current `main`:

```text
project slug: l99
repository: jussray/l99-StoryEngine
```

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

## SUPERSEDED DIRECT-BRIDGE PRS

### Story Engine PR #18

PR #18 is an old direct L99-only OIDC bridge. Its architecture is superseded by merged Founder Control Room PR #21.

### Story Engine PR #39

Pull request: `jussray/l99-StoryEngine#39`
Branch: `fix/current-main-oidc-status-bridge`
Base: `3a6b8ca6be3148876f4e62fac7440b92682b5eec`
Exact head: `3a494c71fdad648e1f5fff3bffd9e247bf1d7b55`
Changed files: 4

PR #39 repairs the old direct bridge correctly in isolation, including exact-main OIDC restrictions and the current cookie gate. However, merging it would revive the retired L99-specific observation channel and duplicate the provider-neutral evidence path.

Local contract evidence for PR #39 remains valid but does not make the architecture canonical:

- isolated exporter and test reproduction: 9 tests passed;
- Python compilation: passed;
- pull-request publish job: correctly skipped;
- no external POST occurred.

Hosted evidence:

| Workflow | Run | Job evidence | Classification |
|---|---:|---|---|
| Publish L99 Control Room Status | `30135161322` | `build-status`: `steps: null`, no logs; `publish` and `enforce-gates` skipped | `runner_startup_failure` |
| Control Room Manifest | `30135161316` | `steps: null`, no logs | `runner_startup_failure` |
| L99 Promotion Gates | `30135161311` | `steps: null`, no logs | `runner_startup_failure` |

Controlled retry job `89617529071` also returned `steps: null` with no logs.

## FOUNDER CONTROL ROOM DECISION

Status: `SUPERSEDE_AND_REBUILD`

Do not merge Story Engine PR #18 or PR #39.

This is not a rejection of their bounded contract logic. It is an architecture decision: Founder Control Room already owns one provider-neutral verification and evidence spine. A second L99-only observer would split provenance, duplicate status events, and create competing release truth.

The correct current-main repair is to:

- update `.control-room/repository.manifest.json` to reflect the current `promotion_gates_all.py` entrypoint and `cookie_contract` evidence;
- verify the canonical project mapping `l99` → `jussray/l99-StoryEngine`;
- retire the legacy direct-publish workflow without deleting its history;
- add a repository-local contract preventing the retired direct observer from regaining OIDC or POST authority;
- run the provider-neutral Founder Control Room verification path.

## RISK

- Browser-readable session key storage remains a production blocker even though ambient cookie authentication is closed.
- Story Engine's current federation manifest still points its workflow usage assertion at `python runtime/promotion_gates.py`, while the current exact entrypoint is `python runtime/promotion_gates_all.py`.
- The current federation manifest does not yet declare cookie-auth contract evidence.
- Leaving the legacy manual OIDC workflow available risks accidental resurrection of a duplicate observation path.
- A green provider-neutral verification would prove bounded repository evidence only, not Story Engine deployment, tenant-safe identity, creator/operator separation, or production release readiness.
- Cloudflare evidence was not involved and must remain separate.

## ROLLBACK

- PR #38 can be reverted through merge commit `3a6b8ca6be3148876f4e62fac7440b92682b5eec` if explicit rollback is approved.
- PR #18 and PR #39 are unmerged; rollback is closure while preserving their branches and history.
- The canonical federation path is already merged through Founder Control Room PR #21.
- No credential rotation, migration, deployment, publication, DNS change, or destructive write occurred in this reconciliation.

## NEXT GATE

1. Rebuild Story Engine's federation manifest on current `main`.
2. Add `runtime/promotion_gates_all.py`, `runtime/cookie_contract.py`, `.security/cookies.json`, browser auth, server auth, and regression tests as declared evidence.
3. Change the workflow usage assertion to `python runtime/promotion_gates_all.py`.
4. Retire the legacy direct OIDC workflow without deleting history and prove it has no token or POST authority.
5. Add the federation contract to the full promotion registry.
6. Verify locally and through hosted exact-head checks when runners provision.
7. Merge the focused federation repair.
8. Close Story Engine PR #18 and #39 as superseded, preserving both branches.
9. Capture the resulting provider-neutral Founder Control Room verification record before claiming the reconciliation complete.
