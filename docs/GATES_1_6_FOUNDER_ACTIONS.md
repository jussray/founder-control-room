# Gates 1–6: Founder Action Items & Verification

**Status:** HISTORICAL SNAPSHOT / CURRENT REVALIDATION REQUIRED  
**Original snapshot:** 2026-10-24 06:55Z  
**Corrected against FCR current source:** 2026-10-29  
**Scope:** Jussray, Chief AI Machine, Founder Control Room, Se'kret Bip

> This page previously presented a historical multi-project checklist as an active runbook, including an unconditional instruction to generate and paste a GitHub App private key. That instruction is **superseded**. A failed historical GitHub App key-preflight does not prove a secret needs replacing today. Do not rotate, delete, paste, or replace credentials based on this document. Treat all project statuses below as historical until independently reobserved at the exact current revision and provider.

## Executive Summary

The October 24 snapshot described several gates as merged, deployed, or pending a founder action. Those claims cannot be carried forward to October 29 without fresh repository and provider readback. In particular, **code presence, workflow success, review-witness publication, deployment, and merge authority are distinct kinds of evidence**.

The active repository-level authority references are `docs/FOUNDER_MERGE_AUTHORITY.md`, `docs/SECRETS.md`, `docs/DETERMINISTIC_REVIEW_WITNESS.md`, `.github/workflows/deterministic-review-core-advisory.yml`, and `.github/workflows/github-app-secret-shape-diagnostic.yml`. Current GitHub and live provider observations take priority over this historical checklist.

## Gate 1: Evidence-Sync and GitHub App Trust (historical BLOCKED claim)

**Historical claim:** A prior runbook instructed the founder to generate a new key for an assumed GitHub App and paste a PEM into `APP_PRIVATE_KEY`, then trigger an old evidence-sync workflow. That is **not** a verified current diagnosis or an authorized instruction.

**Current implementation truth:**

- GitHub Actions secret names are `APP_ID` and `APP_PRIVATE_KEY` where consumed by the trusted production environment. The runtime adapter maps them to `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`.
- The repository already has a secret-safe, read-only shape diagnostic in `.github/workflows/github-app-secret-shape-diagnostic.yml`; it is founder-initiated on issue #418 with `/diagnose-fcr-github-app-key <exact-current-main-sha> <auditable-approval-reference>`.
- The trusted deterministic-review witness path is separately implemented in `.github/workflows/deterministic-review-core-advisory.yml` and `scripts/publish-deterministic-review-witness.mjs`; it requires provider-derived exact-PR/base/head proof and trusted App identity.
- Historical [review-witness run 39366213104](https://github.com/jussray/founder-control-room/actions/runs/39366213104) failed in key parsing on 2026-10-20, **before witness publication**. That result does not establish the current value, current transport format, or current GitHub App installation capability.
- The correct follow-up is to inspect **fresh, redacted, exact-scope evidence**. If a current diagnostic shows a real problem, classify whether it is an environment binding, supported transport shape, App identity/installation, or credential defect **before** proposing a separately authorized change. No secret material goes into chat, files, logs, or PR comments.

**Current Gate 1 status:** **NOT CURRENTLY PROVEN**. A prior failure must remain a historical receipt, not an instruction to replace a secret. A green source/test workflow is not a successful live GitHub App authentication proof.

## Gate 2: Leaked-Password Protection

**Historical claim:** Leaked-password protection for the FCR and Se'kret Bip Supabase projects was reported as awaiting dashboard verification.

**Current status:** **UNKNOWN without current project-specific Supabase security readback**. Do not assert enabled or disabled from this checklist. Any provider setting change requires its own authorization, project identity, and reversibility review.

## Gates 3–4: Chief AI CSP and Stripe HMAC

**Historical claim:** The October 24 report described tests and partial live observations, while browser/webhook verification remained unresolved.

**Current status:** **HISTORICAL EVIDENCE ONLY**. Verify the exact Chief AI branch/deployment and the actual browser CSP headers or authenticated webhook behavior before claiming live enforcement. Test fixtures are not production provider receipts.

## Gate 5: Cloudflare Access Preview Policy

**Historical claim:** A decision about preview Access was tied to old PR #206 and a preview asset-exclusion test.

**Current status:** **STALE TARGET / REACQUIRE**. Read the current Chief AI repository, live preview bindings, and current applicable PR before taking an Access action. No automatic approval, merge, or preview-policy mutation is granted by this old checklist.

## Gate 6: Se'kret Bip Migration Dispatch

**Historical claim:** A migration identified as `20261006040000` and PR #1136 was described as merged and awaiting dispatch.

**Current status:** **PROVIDER APPLICATION UNKNOWN**. Reacquire exact Se'kret Bip repository source, migration ledger, affected environment and current deployment authority. Do not dispatch or roll back database migrations from an old checklist without a fresh exact-target plan and approval.

## Current Verification Sequence

1. Reacquire exact source heads and open PRs for each affected product. Never reuse a historical base/head as current proof.
2. Read the current workflow's required environment, secret name **only**, and provider/scope. For GitHub App issues, use the existing redacted diagnostic before proposing any key change.
3. Separate current runtime/provider observations from source contracts and historical test receipts. Preserve failures independently.
4. Run relevant read-only checks first. Record GitHub Actions exhaustion or runner startup failures separately from executable failures.
5. Require specific founder authorization for any merge, credential mutation, production deploy, database migration, Cloudflare Access policy, or privacy-impacting change.
6. Re-observe the final state at its exact target and preserve rollback receipts.

## Proof Ledger

| Gate | Historical claim | Current status |
| --- | --- | --- |
| 1. GitHub App evidence sync and witness | Secret replacement suggested | **Superseded instruction; current credential validity unknown** |
| 2. Leaked-password protection | Dashboard action outstanding | Provider readback needed |
| 3. Chief CSP | Tests and limited runtime evidence | Fresh browser/runtime proof needed |
| 4. Chief Stripe HMAC | Tests and limited runtime evidence | Fresh webhook proof needed |
| 5. Preview Access | PR #206 decision pending | Current target/Access state needed |
| 6. Se'kret migration | PR #1136 merged; deploy pending | Current remote migration readback needed |

## Authority & Rollback

There is no safe universal claim that all six actions are reversible. In particular, deleting or overwriting a configured GitHub App private key is **not an appropriate rollback instruction**. Use the per-provider authority, impact, and recovery contracts for any actual change. This update changes documentation only; it does not change a GitHub secret, app installation, database, Worker, merge, or deployment.

**Historical document source:** 2026-10-24 founder checklist.  
**Correction:** 2026-10-29 source-versus-runtime reconciliation; current state remains subject to fresh evidence.
