# Unified continuity implementation receipt

Date: 2026-09-24 America/New_York

## Goal

Preserve both standing laws without collision:

- active work rolls forward when its trusted base moves;
- already-proven deployment candidates may survive only explicitly safe non-deploying drift.

## Implemented on branch

`fix/deployment-candidate-lease`

### Work continuity

- `docs/PR_CONTINUITY.md` remains the active-work rollover law.
- `docs/CONTINUITY_MODEL.md` binds rollover and deployment-candidate leasing into one state model.
- `scripts/continuity_model_guard.py` attacks both laws in one temporary Git history.

### Deployment proof continuity

- `docs/DEPLOYMENT_CANDIDATE_LEASE.md`
- `.deployment-authority.json`
- `scripts/deploy_candidate_guard.py`

### Provider-topology guard

- `scripts/audit_pr_continuity_rulesets.mjs`
- `config/pr-continuity-ruleset-desired-state.json`
- `docs/PR_CONTINUITY_PROVIDER_RULE.md`
- `docs/receipts/2026-09-24-pr-rollover-ruleset-blocker.md`

## Verified reference

`jussray/sync-party-game` has already proven the unified model under Python and its full Wrangler/two-browser runtime gate. Safe documentation drift preserves a candidate; runtime drift revokes it; active work receives a successor head when its base moves.

## FCR live provider finding

Main-push PR Continuity run `36078682762` executed the real rollover path and failed after the attack tests passed. GitHub rejected PR #876 update-branch with ruleset violations including required checks, Code Scanning, linear-history enforcement, and missing review/production deployments.

Ruleset `20819094` is active and includes `~ALL`, which extends release controls to feature branches. This is now an explicit provider blocker, not an inferred rollover failure.

## Authority status

- Unified model: SOURCE IMPLEMENTED on review branch.
- Python model attack: wired into FCR quality gate.
- Live provider ruleset audit: wired into FCR quality gate.
- Provider-side ruleset correction: BLOCKED by available connector authority; no ruleset mutation performed.
- PR #876 merge: NOT AUTHORIZED until provider topology is corrected, rollover succeeds, and successor exact-head proof is fresh.

## Rollback

The FCR work is isolated to `fix/deployment-candidate-lease`. No provider rules, production resources, migrations, Worker, or Pages deployment were changed by this implementation.
