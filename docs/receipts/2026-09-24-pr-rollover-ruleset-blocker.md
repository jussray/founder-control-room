# PR rollover ruleset blocker receipt

Date: 2026-09-24 America/New_York

## Authority

- Repository: `jussray/founder-control-room`
- Root branch: `main`
- Main SHA observed: `0d9b09613cf60c432743635fcdf6633ca86dd7be`
- PR Continuity workflow run: `36078682762`
- Rollover artifact: `pr-continuity-rollover-0d9b09613cf60c432743635fcdf6633ca86dd7be`
- GitHub ruleset: `20819094` (`Founder Control Room main exact-head gate`)

## VERIFIED

The main-push PR Continuity workflow executed its 20 attack tests successfully, then failed in the real `rollover` mutation step.

PR #876 was rejected by GitHub `update-branch` with HTTP 422. Provider evidence included:

- required status check `Required Gate` expected;
- Code Scanning pending or not configured for the target branch;
- branch must not contain merge commits;
- missing successful `founder-signal-engine-review` deployment;
- missing successful `production` deployment.

The live ruleset is active and targets branches with ref includes:

- `~DEFAULT_BRANCH`
- `refs/heads/Main`
- `~ALL`

It contains production-grade rules including required status checks, Code Scanning, required linear history, and required deployments.

## Root cause

`~ALL` extends release/main protections onto active feature branches. GitHub's `update-branch` operation updates a PR branch with the latest base, and that operation is rejected because the working branch is simultaneously required to satisfy release deployment gates and to contain no merge commit.

This is a policy-topology contradiction, not a failure of the ancestry/rollover algorithm.

## Required provider-side fix

Remove `~ALL` from ruleset `20819094` and scope the release rules to `~DEFAULT_BRANCH` plus any deliberate release refs. Do not weaken the required checks, deployment requirements, or linear-history rule on the release branch merely to make working branches mutable.

Working branches should obtain proof from PR workflows. Release/main should retain the production-grade merge/deployment rules.

## Source guard

`scripts/audit_pr_continuity_rulesets.mjs` now detects active production-grade rulesets that include `~ALL` and fails closed with `ALL_BRANCH_RELEASE_RULES_BLOCK_ROLLOVER`.

The quality gate runs that audit before accepting the unified continuity contract.

## Status

- Active-work rollover algorithm: SOURCE IMPLEMENTED / tests pass.
- Live provider rollover: BLOCKED by ruleset topology.
- Deployment Candidate Lease reference implementation in SYNC: VERIFIED independently.
- FCR PR #876: not authorized to merge until rollover/provider policy is corrected and exact successor proof is reacquired.

## Rollback

All candidate-lease and unified-continuity changes remain isolated on `fix/deployment-candidate-lease`. No production deploy or provider ruleset was mutated by this receipt.
