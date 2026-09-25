# Portfolio continuity provider targets receipt

Date: 2026-09-24 America/New_York

## Source of truth

- Provider matrix: `docs/receipts/2026-09-24-portfolio-continuity-provider-matrix.md`
- Machine targets: `config/portfolio-continuity-provider-targets.json`
- Unified continuity law: `docs/CONTINUITY_MODEL.md`

## Key result

The standing continuity issue is not one universal ruleset defect.

There are three distinct provider states:

1. **Over-scoped release governance**: FCR applies production-grade release rules to `~ALL`, blocking active-work rollover.
2. **Topology-compatible release governance**: Bip and Chief scope their active release-grade rules to default/named governance refs rather than all branches.
3. **Missing release governance**: StoryEngine, PromptOS, JBH, and SYNC have no observed release ruleset protection; this does not block rollover but leaves `main` insufficiently protected at provider level.

Untold Stories remains UNKNOWN because GitHub rejected ruleset inspection under its current plan/privacy state.

## Standing correction strategy

- Never weaken release/main proof requirements to unblock working branches.
- Never apply release requirements to `~ALL` without a proven provider-compatible rollover mechanism.
- Working branches use exact-head PR proof and rollover receipts.
- Default/release branches use repository-specific required checks/deployments.
- Deployment Candidate Leases remain separate from work rollover.
- Unknown provider state fails closed.

## Mutation authority

The available GitHub connector exposes ruleset reads but not ruleset administration writes. Therefore source contracts, audits, desired states, and exact admin actions have been created without falsely claiming provider settings were changed.
