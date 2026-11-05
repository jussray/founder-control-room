# Workflow Audit & Repair: existing-system integration

The FCR coordination route is `.ai/skills/workflow-audit-repair/SKILL.md`. It is a routing contract, not a new autonomous runtime, plugin installation or approval source. Existing GoalFix, TypeScript, portfolio, Codex and gstack skills remain specialized executors when available.

## Automated repair boundary

The FCR `.github/workflows/ai-failure-repair.yml` responds to **same-repository failed `CI` push runs on current `main`**. It verifies the failed SHA and repairs at most two bounded model passes. It excludes governance, CI policy, tests, migrations, auth credentials, dependency manifests and provider configuration from unattended edits. Causes outside this envelope remain explicitly blocked for a scoped human-authorized fix.

When focused and user-path checks pass, the workflow emits a `verified-candidate.patch` plus `final-repair-receipt.json` as a GitHub Actions artifact. The receipt carries failed SHA, run ID, attempt, failure fingerprint, patch SHA-256, runner checks and release state `CANDIDATE_VERIFIED_AWAITING_FOUNDER_REVIEW`. **No GitHub App write token, remote commit, branch push, PR, merge or deployment is executed by this workflow.**

The patch artifact is not an exact new Git HEAD. Successful runner checks prove only the isolated candidate, not new-head CI, production provider state, founder approval or user outcomes. Keep artifacts and logs free of credentials and unrelated private customer or teen data.

## Legitimate activation route

1. Founder authorizes the exact repo/candidate/branch and scope. Recheck the artifact digest and current authoritative base.
2. An authorized operator applies the candidate to an isolated review branch via the existing repository workflow. A moved base requires reconciliation and a fresh diff, not receipt replay.
3. Run new-head CI, independent code review, privacy/security checks, documentation truth and relevant Playwright/runtime tests.
4. A new PR requires separate authorization. Merge requires authenticated founder-final approval bound to exact PR, base SHA and head SHA under `docs/FOUNDER_MERGE_AUTHORITY.md`; deployment and post-deploy proof remain independently gated.
5. Roll back by leaving the branch unmerged or using a reviewed revert. Do not rewrite or delete shared history.

## Verification limits

`node --test scripts/workflow-audit-repair.test.mjs` is a structural contract test with negative mutation cases. It cannot itself prove a GitHub Actions run, secrets configuration, model-generated patch validity, live integration, or enforcement by GitHub branch rules. Review branch CI and runtime evidence remain required.
