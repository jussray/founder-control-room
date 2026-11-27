# Handshake merge-gate reconciliation — FCR and Se’kret Bip

Contract: `jussco/governance-premerge-release-split@v1`.

**Scope:** FCR PR #1194 and Bip PR #1283. Authored code is not proof that live GitHub rulesets changed.

## Defect and precise fix
FCR rulesets 20819094 and 28182360 and Bip rulesets 27168673 and 21250004 require checks that only run for certain paths, on a failed main build, or after production deployment. These cannot legitimately pass on every branding pull request. Bip also has review settings that conflict with the checked-in founder-only governance phase.

The allowlisted `scripts/reconcile-handshake-rulesets.mjs` reconciles exactly those existing rulesets, with an exact-current-main and exact-PR-head guard. It preserves CodeQL/security scanners, code quality, deletion and force-push protection, signatures, linear history, branch targets, existing bypass actors, stale-review invalidation and thread resolution. It moves production-only deployment requirements **out of the premerge branch-rule stage** only after inspecting current-main release workflow source and protected environment configuration; release workflows retain production-environment approvals, exact-current-main checks, Cloudflare runtime verification and smoke checks.

Bip's founder-only change to zero required approving reviews and disabled code-owner/latest-push approval is permitted only if the exact current-main governance contract still confirms those founder-only values. Missing trusted evidence fails closed.

## Execution
1. Merge the source workflow into trusted FCR main through its existing authorized GitHub merge path. Source PR and its CI alone cannot mutate provider rulesets.
2. In GitHub Actions, open **Handshake Ruleset Reconciliation** and run `workflow_dispatch` with target repository, PR number and exact main/head SHAs, with `apply=false`. This performs read-only GitHub provider queries and returns candidate payloads with a SHA-256 plan digest.
3. Review the candidate plan, obtain explicit founder approval bound to that digest and head, then rerun with `apply=true` and the same inputs. The trusted job requires the protected `founder-signal-engine-review` environment and a repository secret named `GITHUB_RULESET_ADMIN_TOKEN` with repository rules administration. **Never place tokens in code, PRs, issue text or frontend.**
4. The executor refetches live provider state immediately before each mutation, checks exact snapshot hashes, writes only allowlisted ruleset IDs, checks provider readback, and attempts limited compensation for an unsuccessful multi-ruleset write. Confirm enforcement with a negative and positive PR test before declaring the merge gate operational.

## What this does not do
The source branch alone does not apply GitHub settings, merge PRs, publish Instagram content, submit Handshake profiles, deploy apps or charge a payment. Never forge green check statuses, bypass the user's rules or claim provider completion from authored code.

## Rollback
Preserve original provider payloads in the approved receipt. If current provider state differs from the approved candidate, do not overwrite it. Roll back only an exact still-owned update, then verify full provider readback. If any readback or rollback fails, mark the operation as HOLD.
