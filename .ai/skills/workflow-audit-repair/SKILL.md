---
name: workflow-audit-repair
description: Route authorized workflow audits, CI failures and code repairs through existing FCR and engineering skills, verify the actual result, and produce an exact-evidence candidate for founder review.
version: 0.1.0
scope: founder-control-room
---

# Workflow Audit & Repair

## Job and trigger

Use when asked to audit a software workflow, diagnose failing CI, repair repository code, verify a patch, or assess launch readiness. This is a **thin skill router**, not a new operating system, watcher, provider, background agent, or permission source. It is a repository skill document, not evidence of a ChatGPT plugin installation or live activation.

Read `AGENTS.md`, `GLOBAL_AI.md`, `.ai/skills/juss-founder-os/SKILL.md`, `docs/FOUNDER_MERGE_AUTHORITY.md` and the affected repository's stricter guidance. **Only inspect explicitly authorized repositories, accounts, data and environments.** Never infer permission from connector access, a status label, or a previous review.

## Reuse existing capabilities

- FCR's `skills/portfolio-control-plane` and `skills/typescript-audit`: repository/portfolio reality and risk.
- `.ai/skills/goalfix`, `skills/typescript-root-cause-debugger` and `skills/typescript-minimal-patch`: root cause and bounded repair.
- `skills/typescript-behavior-tests` and `skills/typescript-strict-review`: regression protection and independent review.
- Codex Code Work / Code Verification, Engineering Suite Debug, gstack Health/QA, and Codex Coordinator: **only if actually available and invoked**; never fabricate worker execution or results.
- Existing GitHub PR, founder-final approval, and separate provider deployment gates govern release.
- PromptOS ACTUAL-FLOW V4 remains a **draft reference**, not an approved registry entry. Chief AI is a separate system and must never inherit FCR authority or customer data.

## Contract and sequence

1. **DISCOVER:** Identify Who, What, Where, When, Why, How; exact repository, authoritative branch, current 40-character HEAD, user outcome, constraints, approvals, critical paths, existing tests, and rollback.
2. **AUDIT:** Inspect current CI, runtime/provider evidence, relevant logs, code, tests, security, privacy, identity and integration boundaries. Parallelize only independent read-only checks. Separate VERIFIED / PARTIAL / INFERRED / UNKNOWN / BLOCKED / STALE evidence.
3. **DIAGNOSE:** Reproduce and classify the earliest causal defect, as opposed to symptoms, skipped jobs, stale receipts or missing provider authority. Red Team I challenges the premise.
4. **REPAIR:** Only with scoped code-write approval, add a failing test when permitted and create the smallest reversible change. Assign one write owner per file. Do not remove protection, customer isolation, tests, auth, RLS, cookie consent, or detection to obtain green.
5. **VERIFY:** Focused red-green regression, full proportional CI, lint/type/build, security and user-path/browser checks as applicable. Reinspect the integrated diff independently; Red Team II probes prompt injection, replay, SHA drift, data leakage, regression and rollback.
6. **STAGE:** FCR's unattended `.github/workflows/ai-failure-repair.yml` may build and verify a SHA-256-bound patch artifact and receipt **only**. It must not push any branch, create a PR, merge, deploy or publish. Runner green is candidate proof, not fresh post-application CI or production proof.
7. **RELEASE:** With separate founder authority, an operator validates the patch and current branch, applies it in an approved review branch, runs fresh exact-HEAD checks, obtains independent review, then requests explicit exact PR/base/head founder approval to merge. Deployment is a separate gate.

Never inspect unrelated private material, share secrets or user data, merge on generic approval, create an unrequested PR, or automatically delete branches or history. Cryptographic proof fingerprints are not browser/device fingerprints and do not authorize tracking.

## Output and stop

Return `REALITY / BOTTLENECK / FIX / PROOF / RISK / ROLLBACK / NEXT GATE` with exact SHA, evidence origin and timestamps. Distinguish AUTHORING from APPLIED changes and VERIFIED results. Stop at verified acceptance, stale/missing evidence, forbidden scope, unreconciled contradictory evidence, or an approval boundary; preserve remaining capabilities rather than indefinitely disabling them.

See `docs/WORKFLOW_AUDIT_REPAIR.md`.
