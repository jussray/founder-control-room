# Deployment Candidate Lease v1

## Problem

Production authority must remain bound to an exact, proven commit SHA, but requiring that SHA to remain equal to a moving `main` causes harmless documentation and receipt commits to invalidate an otherwise unchanged production candidate.

That creates proof churn without increasing safety.

## Rule

An approved deployment candidate remains valid when all of the following are true:

1. The candidate SHA is exact and immutable.
2. The candidate is an ancestor of current `main`.
3. Every path changed after the candidate matches the repository's explicit non-deploying drift allowlist.
4. Unknown paths fail closed and revoke the lease.
5. Runtime, deployment, workflow, dependency, migration, configuration, authority, or policy changes always require a new candidate unless that repository explicitly proves otherwise.
6. Production deploys the candidate SHA, not whatever happens to be current `main`.
7. Runtime/prod proof and receipts remain bound to the deployed candidate SHA.

## Why this is safer than current-main equality

`candidate == current main` confuses two different facts:

- **identity:** what exact code was approved and proven; and
- **freshness:** whether later repository changes affect the deployable artifact or its authority.

The lease keeps identity exact while classifying freshness explicitly.

## Fail-closed drift classification

Each repository owns `.deployment-authority.json`.

Only listed `safe_drift_globs` may advance after the approved candidate without revoking it. Anything else is deployment-sensitive by default.

A repository must never globally copy another repository's allowlist. A path is safe only when that project's build/deploy graph proves it does not affect runtime, packaging, migrations, secrets, authority, verification, or publication.

## Lease invalidation

The candidate must be replaced when any of these occur:

- candidate is no longer an ancestor of `main`;
- any non-allowlisted path changes;
- the safe-drift policy changes after candidate approval;
- the deployment workflow or verifier changes;
- runtime/prod proof fails;
- founder explicitly revokes the candidate;
- rollback/supersession creates a new production authority subject.

## Receipt fields

Every deployment authority receipt should preserve:

- repository
- candidate SHA
- current-main SHA observed at authority check
- approval reference
- proof run / proof artifact
- safe-drift policy version and hash when available
- changed safe-drift paths, if any
- deployment URL / provider identity
- production verification result
- successor or rollback reference

## Standing portfolio behavior

This contract is the default production-authority pattern for user-owned projects. Exact SHAs remain mandatory proof anchors. The lease only prevents non-deploying repository drift from needlessly invalidating them.

Reference implementation: `jussray/sync-party-game` (`scripts/deploy_candidate_guard.py` + `.deployment-authority.json`).
