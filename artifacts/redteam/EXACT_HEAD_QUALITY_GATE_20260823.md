# Exact-Head Quality Gate Red Team — 2026-08-23

## Premise attack
A workflow-level green is not proof when the runner tested GitHub's synthetic pull-request merge ref instead of the immutable pull-request head.

## Observed failure
Historical PR #35 run metadata named head SHA `15c4a181d8a5dcea854c181c963c64390a2a17fa`, while the job log showed `actions/checkout@v4` fetched and checked out synthetic merge ref `2332f5792af22a7bc96cb5e02fad9c4a13c7ea47`.

## Selected-plan attack
Merely recording `github.event.pull_request.head.sha` is insufficient. Every load-bearing checkout must explicitly use that ref and then compare `git rev-parse HEAD` with the expected SHA. Migration lint must fail closed rather than use `continue-on-error`.

## Kill criteria
Reject the change if any required quality-gate job can run against an unverified checkout, if Migration Lint can fail without blocking Production Build, or if optional vendor checks become substitutes for repository-native gates.

## Rollback
Revert the workflow commit if exact-head expressions break non-PR execution. This workflow is pull-request-only, so the fallback `${{ github.sha }}` is retained for expression durability.

## Authority
This artifact changes verification mechanics only. It authorizes no merge, deploy, migration, terminal execution, pricing, contact, spend, checkout, refund, publication, or customer-data action.
