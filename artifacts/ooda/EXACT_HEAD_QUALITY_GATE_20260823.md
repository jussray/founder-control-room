# Exact-Head Quality Gate OODA — 2026-08-23

## Observe
PR #35's required jobs executed successfully, but the job log proved that GitHub Actions checked out the synthetic pull-request merge ref rather than the immutable PR head.

## Orient
The failure is in evidence identity, not in TypeScript, lint, tests, migration SQL, terminal logic, or AI-skill logic. Current `ci.yml` already uses exact-head checkout for most load-bearing jobs; `quality-gate.yml` did not, and CI Migration Lint remained advisory.

## Decide
Make the smallest compatible repair in `quality-gate.yml`: define `EXPECTED_HEAD_SHA`, bind every checkout to it, verify `git rev-parse HEAD`, add a required Migration Lint job, and make Production Build depend on it.

## Act
Patch only the quality-gate workflow and add governance evidence artifacts.

## Verify
The repair is complete only when the PR's own workflow logs show the exact branch head checked out and all required jobs pass. A workflow-level green without matching checkout evidence is insufficient.

## Rollback
Revert the focused workflow commit if the exact-head binding causes invalid checkout behavior.
