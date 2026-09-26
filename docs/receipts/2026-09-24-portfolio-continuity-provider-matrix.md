# Portfolio continuity provider matrix

Date: 2026-09-24 America/New_York

## Purpose

Audit provider-side GitHub branch/ruleset topology against the unified continuity model:

- active work must be able to roll forward onto a moved trusted base;
- release/default branches must retain production-grade protection;
- already-proven deployment candidates use exact-SHA leases with fail-closed drift classification;
- provider policy must not collapse active-work proof and release/deployment proof into the same branch rule.

## Matrix

| Repository | Live provider state | Rollover topology | Release protection | Required action |
|---|---|---|---|---|
| `jussray/founder-control-room` | Active ruleset `20819094` includes `~DEFAULT_BRANCH`, `refs/heads/Main`, and `~ALL`; rules include required checks, Code Scanning, linear history, and required deployments | **BLOCKED**: live `update-branch` received HTTP 422 under these all-branch release requirements | Strong, but over-scoped | Remove `~ALL`; keep release rules on `~DEFAULT_BRANCH` and deliberate release refs; re-run continuity proof |
| `jussray/Sekret-Bip` | Active ruleset `21250004` scopes to `~DEFAULT_BRANCH` plus named `main-governance` ref | **TOPOLOGY COMPATIBLE**: no `~ALL` observed | Present on release/default refs | Preserve; continue exact-head/PR continuity verification |
| `jussray/chief-ai-machine` | Active rulesets `20818149` and `21261587` scope to `~DEFAULT_BRANCH` plus named governance ref | **TOPOLOGY COMPATIBLE**: no `~ALL` observed | Strong release rules include status checks, linear history, CodeQL, and deployments | Preserve; continue exact-head/PR continuity verification |
| `jussray/StoryEngine` | No repository rulesets; `main` reports `protected:false` | No ruleset-induced rollover blocker | **GAP**: release/default branch has no provider ruleset protection | Design repo-specific main/release ruleset from actual checks/deployments; do not apply `~ALL` |
| `jussray/promptos` | No repository rulesets; `main` reports `protected:false` | No ruleset-induced rollover blocker | **GAP** | Design repo-specific main/release ruleset from actual checks/deployments; do not apply `~ALL` |
| `jussray/jussbeautifulhair-site` | No repository rulesets; `main` reports `protected:false` | No ruleset-induced rollover blocker | **GAP** | Design repo-specific main/release ruleset from actual checks/deployments; do not apply `~ALL` |
| `jussray/untold-stories-storefront` | Ruleset API returned GitHub plan/privacy 403 | **UNKNOWN** | **UNKNOWN** | Preserve UNKNOWN; inspect using permitted provider/admin surface before changing policy |
| `jussray/sync-party-game` | No release ruleset was observed during the SYNC audit; unified continuity code/proof is the reference implementation | Source/runtime continuity model **VERIFIED**; provider release protection remains separate | Governance gap previously observed on `main` | Keep as reference implementation; add provider release protection separately when admin authority is available |

## Standing topology law

### Working branches

- exact-head PR CI and review proof;
- conflict-safe rollover when trusted base moves;
- successor head becomes a new proof subject;
- predecessor proof and approvals expire;
- no production deployment requirement merely to update the branch.

### Default/release branches

May carry production-grade provider controls such as:

- required status checks;
- Code Scanning / code quality;
- linear history;
- deletion/non-fast-forward protection;
- required production deployments;
- merge authority policy.

These controls must not be applied to `~ALL` unless there is a separately proven provider-supported rollover mechanism that can satisfy or bypass them without weakening release authority.

## Classification

- FCR: `PROVIDER_BLOCKED / FIX_SPECIFIED / ADMIN_MUTATION_PENDING`
- Bip: `TOPOLOGY_COMPATIBLE`
- Chief: `TOPOLOGY_COMPATIBLE`
- StoryEngine: `RELEASE_PROTECTION_GAP`
- PromptOS: `RELEASE_PROTECTION_GAP`
- JBH: `RELEASE_PROTECTION_GAP`
- Untold Stories: `UNKNOWN_PROVIDER_STATE`
- SYNC: `CONTINUITY_REFERENCE / RELEASE_PROTECTION_GAP`

## Stop rule

Do not copy a ruleset wholesale between repositories. Required checks, deployment environments, and safe deployment-drift paths must come from each repository's actual build/deploy graph. The portable invariant is topology, not the literal check names.
