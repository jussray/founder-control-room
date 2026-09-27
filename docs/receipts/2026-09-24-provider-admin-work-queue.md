# Provider admin continuity work queue

## Immediate blocker

### FCR ruleset 20819094

State: `BLOCKED_PROVIDER_ADMIN`

Required bounded mutation:

- remove `~ALL` from the active branch ruleset include conditions;
- retain `~DEFAULT_BRANCH` and only deliberate release refs;
- preserve release-grade required checks, Code Scanning, code quality, linear history, deletion protection, and required deployments;
- rerun live ruleset audit and PR Continuity from current main;
- prove stale same-repository PRs receive successor heads;
- reacquire exact-head proof and explicit merge approval.

## Release-protection design queue

These repos have no observed release ruleset and unprotected main:

- `jussray/StoryEngine`
- `jussray/promptos`
- `jussray/jussbeautifulhair-site`
- `jussray/sync-party-game`

For each repository, inspect actual CI check names, deployment environments, build graph, and merge method before creating a main/default-branch-only ruleset. Do not copy FCR, Bip, or Chief literal checks.

## Preserve

No provider topology mutation currently required for:

- `jussray/Sekret-Bip`
- `jussray/chief-ai-machine`

Their observed active rulesets are not scoped to `~ALL`.

## Unknown

`jussray/untold-stories-storefront` ruleset inspection is unavailable through the current GitHub API/plan context. Preserve UNKNOWN and do not infer absence or compatibility.
