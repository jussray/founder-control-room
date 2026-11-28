---
name: actions-mail-audit
description: Read-only triage for GitHub Actions failure emails, security notices, and stale CI alerts. Use Gmail as a signal and GitHub exact-head readback as authority.
---

# Actions Mail Audit | Gmail signal → GitHub proof

This repo-local skill is an **exported on-demand workflow**, not a scheduled ChatGPT task or an active Gmail integration. Before any work read the local `AGENTS.md` and stricter governance and privacy contracts. Use `/goalfix`, `/truthmode`, two red-team passes, L99, and OODA to prioritize one real cause.

1. **Acquire safely:** When an **explicitly authorized** Gmail connector is available, inspect all three founder-approved connected accounts, including Inbox, Spam, Trash, and full mail, without modifying messages. Search failure notifications from GitHub and provider/security notices. If Gmail is unavailable in this runtime, request a **sanitized metadata input**; never assume that ChatGPT's Gmail connector is automatically connected to Copilot or a GitHub runner.
2. **Minimize:** Pass only `mailbox`, `message_id`, `received_at`, `labels`, `kind` (`actions` or `security`), and the exact canonical GitHub Actions `run_url`. No message bodies, tokens, passwords, cookie contents, customer records, teen/guardian data, provider payloads, tracking query strings, or raw attachment content. Do not commit inputs or outputs.
3. **Reconcile:** Compare reported run with GitHub run ID, outcome, run head, exact CURRENT repo branch/main, affected PR and required checks, executed jobs/logs, and independent provider/deployed/browser identity where relevant. Use the included pure/read-only script to classify `CURRENT_RED`, `STALE_HEAD_NOT_PROVEN_FIXED`, `PENDING`, `COVERAGE_BLOCKED`, or `CURRENT_RUN_GREEN_ONLY`. The last status NEVER means all checks passed or production is working. Security findings require private provider incident validation and credential revocation decision, regardless of green CI.
4. **Report:** Dedupe by exact repository, run/head, failure signature; distinguish historical notifications from current blockers, code failures from runner-startup and exhausted minutes, and security alerts from proved credential leaks. Include a link, source account/label, evidence freshness, and one reversible next gate. Never change Gmail labels, read state, routing, source code, secrets, permissions, workflows, or production on a monitoring pass.
5. **Permissions:** Script only performs HTTPS GETs to the GitHub API. The current repository's `GITHUB_TOKEN` or `GH_TOKEN` must have read access. Nothing in this skill creates authentication, merge/deploy authority, or provider ownership. A private FCR connector can later feed authorized metadata to the skill, but that integration is **NOT installed by these files**.

## Invocation

For authorized, sanitized input, pipe a JSON object of this shape to the script using an existing read-only session. `GITHUB_REPOSITORY` scopes alerts to this repository:

```json
{"schema":"juss.actions-mail-input@v1","notices":[{"message_id":"example-id","mailbox":"example@example.test","received_at":"2026-10-30T00:00:00Z","labels":["INBOX"],"kind":"actions","run_url":"https://github.com/jussray/REPOSITORY/actions/runs/12345"}]}
```

```sh
node --test .github/skills/actions-mail-audit/tests/triage.test.mjs
# Only after an authorized source supplies sanitized JSON on stdin:
# GITHUB_REPOSITORY=jussray/REPOSITORY GH_TOKEN=<provided via secure environment> node .github/skills/actions-mail-audit/scripts/triage.mjs < sanitized-notices.json
```

The example placeholders are not runtime configuration. Never copy personal tokens into logs, a code file, or a prompt. Read-only on-demand profile: `.github/agents/actions-mail-auditor.agent.md`. No automatic ingestion or delivery should be claimed until separately proven.

## FCR native provider handoff (implemented as an opt-in local command)

This repository now includes `.github/skills/actions-mail-audit/scripts/gmail-readonly.mjs`. It queries ONLY Gmail's read endpoints to acquire metadata for recent GitHub notification and GitGuardian messages. It confirms the authenticated Gmail profile matches one of the designated founder mailboxes and includes Inbox, Spam, and Trash. It uses the body **in memory only** to extract a canonical `github.com/jussray/.../actions/runs/<id>` link; bodies, tracking tokens, HTML, raw headers, attachments, and OAuth tokens never enter the output. GitGuardian messages without a matching run link are allowed as UNVERIFIED security triage only if their subject names the exact repository.

The adapter requires a separately authorized Google OAuth grant with the **`https://www.googleapis.com/auth/gmail.readonly` scope** for each mailbox. It accepts either a protected short-lived `GMAIL_READONLY_ACCESS_TOKEN` or a mailbox-specific `GMAIL_AUDIT_REFRESH_TOKEN` with dedicated `GMAIL_AUDIT_CLIENT_ID` and `GMAIL_AUDIT_CLIENT_SECRET`. The refresh flow POSTs only to Google's token endpoint to obtain a short-lived access token in memory; all mailbox operations are GET-only. It does **not** initiate consent, grant scopes, provision or store OAuth credentials. Existing ChatGPT Gmail connections cannot be reused or copied automatically. Do not reuse FCR's separate reply/sending OAuth grant, which may have broader permission. **Project-side read-only OAuth grants and scope have not been independently verified.** If absent, wrong scope, or mailbox mismatch, return BLOCKED. The GitHub readback step independently requires repository-scoped GitHub API `actions:read` and `contents:read`, supplied by the authorized environment. Never hand tokens to a console, command argument, GitHub issue, PR comment, commit, or build log.

For a securely provisioned session, pipe the two processes directly without storing raw mail or JSON on disk:

```sh
# Precondition: the named variables are supplied as protected environment secrets.
node .github/skills/actions-mail-audit/scripts/gmail-readonly.mjs |
  node .github/skills/actions-mail-audit/scripts/triage.mjs |
  node .github/skills/actions-mail-audit/scripts/report.mjs
```

All commands require `GITHUB_REPOSITORY` scoped to the exact current repository. Gmail requires `GMAIL_AUDIT_MAILBOX` and separately authorized read-only access/refresh credentials; the GitHub verifier requires a scoped `GITHUB_TOKEN` or `GH_TOKEN` with `actions:read` and `contents:read`. The reporter emits only safe GitHub run links, classifications and counts, not account addresses, message identifiers, email bodies or secrets. A GitHub-owned hourly opt-in runner is defined at `.github/workflows/actions-mail-audit-monitor.yml` and remains inactive unless repository variable `FCR_GMAIL_AUDIT_ENABLED` is explicitly `true` after the workflow reaches the default branch. Its three mailbox grants must be configured separately as `FCR_GMAIL_AUDIT_MAIN_REFRESH_TOKEN`, `FCR_GMAIL_AUDIT_BIP_REFRESH_TOKEN` and `FCR_GMAIL_AUDIT_RAY_REFRESH_TOKEN`, with shared read-only OAuth client credentials `FCR_GMAIL_AUDIT_CLIENT_ID` and `FCR_GMAIL_AUDIT_CLIENT_SECRET`. A schedule on a PR branch is **not** a running production schedule. Scope is FCR repository runs only until separately authorized cross-repository GitHub read access is implemented and verified.

### Authority and FCR integration

FCR already includes the HMAC-verified GitHub webhook path `src/http/webhooks/github.ts`, with bounded `workflow_run` and `check_run` ingestion. Preserve that provider-signature verification, project-resolution logic, and FCR's canonical reconciliation stores. The Gmail adapter is a discovery-only supplement; it **does not** create a webhook, database writer, GitHub workflow-dispatcher, secondary incident authority, or publication pipeline. Never promote email metadata into persisted canonical evidence without the existing authenticated FCR pathway and an explicitly reviewed, tested integration. The Gmail audit performs GET-only mailbox reads; optional OAuth refresh performs a POST only to Google's token endpoint. GitHub reconciliation performs GET-only API reads, and the reporter writes a sanitized GitHub Actions job summary. No OAuth grants, provider secrets, production workers, database writes or project-side runtime execution are proven by repository source.

Offline proof: `node --test .github/skills/actions-mail-audit/tests/*.mjs`. CI runs this on the exact PR head. Mocked tests verify token refresh request handling, mailbox identity checks, pagination limits, safe GitHub run classification, and output sanitization. A passing source test does NOT prove configured scopes, real OAuth grants, automatic monitoring, private-provider resolution, GitHub webhook delivery, production readiness, or incident notification deduplication across separate runs.
