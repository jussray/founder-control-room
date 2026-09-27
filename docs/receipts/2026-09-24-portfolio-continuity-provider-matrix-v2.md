# Portfolio continuity provider matrix v2

Date: 2026-09-24 America/New_York

Supersedes the earlier provider matrix where this receipt is more specific. This version adds repository `allow_update_branch` truth, distinguishes source-check gaps from provider-rule gaps, and records newly proven remediation PRs.

## Standing model

Three independent conditions must be true for healthy continuity:

1. **Active work can roll forward**: provider supports branch update and release rules do not structurally block working branches.
2. **Successor heads can prove themselves**: there is an always-on exact-head PR gate suitable for provider enforcement.
3. **Release/default refs are protected**: production-grade provider rules bind the actual stable proof context to release refs, not `~ALL`.

Deployment Candidate Leases remain a fourth, separate release-proof continuity layer.

## Matrix

| Repository | `allow_update_branch` | Ruleset / main state | Stable always-on PR proof | Candidate-lease state | Classification / next action |
|---|---:|---|---|---|---|
| `jussray/founder-control-room` | `true` | Active ruleset `20819094` wrongly includes `~ALL`; live audit reproduces blocker | Quality Gate and PR Continuity exist | Standard staged in PR #876 | **LIVE_PROVIDER_BLOCKED**. Remove `~ALL`, preserve release rules on `~DEFAULT_BRANCH`, rerun rollover and exact successor proof. |
| `jussray/Sekret-Bip` | `true` | Active ruleset `21250004` scoped to default/named governance refs, no `~ALL` observed | Existing exact-head gates | Not part of this source patch | **TOPOLOGY_COMPATIBLE**. Preserve and audit drift only. |
| `jussray/chief-ai-machine` | `true` | Active rulesets `20818149`, `21261587` scoped to default/named governance refs | Existing exact-head gates | Not part of this source patch | **TOPOLOGY_COMPATIBLE**. Preserve. |
| `jussray/StoryEngine` | `false` | No rulesets; `main` unprotected | `Control Room Test Ledger` / `Verify test-ledger contract` is always-on for PRs. Path-filtered Playwright is additional evidence, not a universal required check. | Not yet implanted | **UPDATE_BRANCH_PROVIDER_GAP + RELEASE_PROTECTION_GAP**. Enable branch updates and create default-branch-only ruleset around the stable ledger context after provider admin authority is available. |
| `jussray/promptos` | `false` | No rulesets; `main` unprotected | `PromptOS Control Room Tests` / `Verify PromptOS control room tests` is always-on exact-head PR proof | PR #41 adds lease; Python contract PASS at `e1787db1f4ce2f7457573a2095ef4a1b75c07887`; heavy browser proof pending at receipt creation | **UPDATE_BRANCH_PROVIDER_GAP + RELEASE_PROTECTION_GAP**. Enable branch updates; protect default branch with stable Control Room + candidate-contract contexts after source proof. |
| `jussray/jussbeautifulhair-site` | `true` | No rulesets; `main` unprotected | PR #99 adds always-on exact-head `Quality Gate / Required Gate`; exact head `b90e9c2211af028a5dc07fc2a01f6a14bb8e88e6` PASS in run `36080256705` | Not yet required for current Shopify lane | **SOURCE CHECK FIX VERIFIED / RELEASE_PROTECTION_GAP**. Provider can later require `Required Gate` on `~DEFAULT_BRANCH`, never `~ALL`. |
| `jussray/sync-party-game` | `false` | No rulesets; `main` unprotected | PR #1 adds exact-head PR `core-proof`; exact head `b8fadf8fef052fb5d5d7c3e9cc74273ca3fa7cd7` PASS in run `36080334377` | Reference implementation VERIFIED; production credential authority separately blocked | **SOURCE CHECK FIX VERIFIED + UPDATE_BRANCH_PROVIDER_GAP + RELEASE_PROTECTION_GAP**. Enable branch updates and protect default branch around `core-proof` once admin authority exists. |
| `jussray/untold-stories-storefront` | UNKNOWN | Ruleset API returned plan/privacy 403 | Existing continuity docs observed historically | UNKNOWN | **UNKNOWN_PROVIDER_STATE**. Do not infer compatibility or absence. |

## Provider design rules learned from the audit

### Never require a path-filtered workflow as the only universal merge check

If a PR does not touch the workflow's configured paths, GitHub may never emit that required context. A release ruleset must prefer an always-on wrapper or always-on exact-head gate.

### `allow_update_branch` is part of continuity authority

A repository may have perfect source rollover logic and still be unable to use GitHub's update-branch provider path when repository settings disable it. That is a provider-admin blocker, not a source bug.

### Default/release rules and working-branch rules are not the same thing

Production deployments, linear-history enforcement, release Code Scanning, and release check contexts belong on default/release refs. Applying them to `~ALL` can make active PR rollover impossible.

## Current source remediation receipts

- JBH PR #99: exact-head always-on Required Gate. Source proof PASS.
- SYNC PR #1: exact-head PR core-proof. Source/runtime proof PASS.
- PromptOS PR #41: Deployment Candidate Lease removes exact-current-main publication coupling. Python contract PASS; heavy Control Room proof still pending at receipt creation.
- FCR PR #876: unified model and live provider audit. Intentionally blocked until ruleset `20819094` is corrected and successor proof is reacquired.

## Admin-plane queue

The current GitHub connector can read repository settings/rulesets but does not expose repository-settings or ruleset administration writes. Therefore the following remain explicitly unexecuted:

- FCR: remove `~ALL` from ruleset `20819094`.
- StoryEngine: enable `allow_update_branch`; add default-branch release protection from real stable checks.
- PromptOS: enable `allow_update_branch`; add default-branch release protection after PR #41 proof.
- SYNC: enable `allow_update_branch`; add default-branch release protection after PR #1 proof.
- JBH: add default-branch release protection after PR #99 proof.

No provider mutation is claimed by this receipt.
