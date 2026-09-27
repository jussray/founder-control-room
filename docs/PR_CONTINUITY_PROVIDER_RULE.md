# PR Continuity Provider Rule

## North Star

Active work can roll forward whenever its trusted base moves without weakening production/release protections.

## Provider topology

Production-grade branch rules belong on the default/release refs they protect. Active work branches are governed by exact-head PR workflows and continuity receipts.

A ruleset that combines any of the following with `~ALL` is incompatible with automatic PR rollover unless the rollover integration has an intentional, documented bypass:

- required status checks that do not yet exist on a successor head;
- Code Scanning results required on every feature-branch update;
- required deployments to production/review environments;
- required linear history when the provider's `update-branch` operation creates a merge commit.

## FCR current correction

Ruleset `20819094` currently includes `~DEFAULT_BRANCH`, `refs/heads/Main`, and `~ALL`.

Required correction:

1. remove `~ALL`;
2. retain `~DEFAULT_BRANCH`;
3. retain deliberate release refs only when they actually exist;
4. preserve required status checks, Code Scanning, code quality, linear history, deletion protection, and required deployments on the release/default branch;
5. keep working-branch proof in PR workflows;
6. rerun main-push PR Continuity after the provider rule is corrected;
7. verify stale same-repository PRs mint successor heads;
8. require fresh exact-head proof on those successors.

## Stop condition

Do not weaken release controls as a workaround. If working branches still cannot roll after scoping the ruleset, preserve the provider rejection receipt and investigate the next exact blocker.
