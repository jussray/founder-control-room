# Ruleset admin action receipt

Provider mutation required outside the currently available connector write scope.

## Target

- Repository: `jussray/founder-control-room`
- Ruleset ID: `20819094`
- Ruleset name: `Founder Control Room main exact-head gate`

## Exact correction

Change `conditions.ref_name.include` from a set containing:

- `~DEFAULT_BRANCH`
- `refs/heads/Main`
- `~ALL`

to the release scope:

- `~DEFAULT_BRANCH`

plus only any deliberate release refs that actually exist.

Remove `~ALL`.

Do not remove the production-grade rules from the release/default branch.

## Reverification after mutation

1. Run the live ruleset audit. It must report zero `ALL_BRANCH_RELEASE_RULES_BLOCK_ROLLOVER` blockers.
2. Trigger PR Continuity from current `main`.
3. Verify stale same-repository PRs roll forward or produce only genuine conflict/provider-specific blockers.
4. Verify each rolled head is a new proof subject.
5. Re-run exact-head PR proof.
6. Do not restore predecessor approvals.

## Current authority

The present connector can read the live ruleset but does not expose ruleset administration mutation. Therefore this receipt records the exact bounded mutation without claiming it was executed.
