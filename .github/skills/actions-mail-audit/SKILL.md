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

The adapter requires a separately granted **Gmail read-only OAuth access token** for each mailbox, injected securely as `GMAIL_READONLY_ACCESS_TOKEN` for that invocation. Existing ChatGPT Gmail connections cannot be reused or copied into this project automatically. It does not request new consent, manage OAuth grants, refresh tokens, or store credentials. **No project-side Gmail OAuth grant is currently verified or installed.** If absent or mismatched, return BLOCKED and do not guess. The GitHub readback step independently requires repository-scoped GitHub API `actions:read` and `contents:read`, supplied by the authorized environment. Never hand tokens to a console, command argument, GitHub issue, PR comment, commit, or build log.

For a securely provisioned session, pipe the two processes directly without storing raw mail or JSON on disk:

```sh
# Precondition: the named variables are supplied as protected environment secrets.
node .github/skills/actions-mail-audit/scripts/gmail-readonly.mjs |
  node .github/skills/actions-mail-audit/scripts/triage.mjs
```

Both commands must have `GITHUB_REPOSITORY` set to the exact `jussray/...` target. The first also requires `GMAIL_AUDIT_MAILBOX` and `GMAIL_READONLY_ACCESS_TOKEN`; the second requires a read-only `GITHUB_TOKEN` or `GH_TOKEN`. Execute once per authorized mailbox; reconcile across those outputs by canonical repo/run identity. This is **on-demand evidence ingestion only**, not a periodic deployment or production worker.

### Authority and FCR integration

FCR already includes the HMAC-verified GitHub webhook path `src/http/webhooks/github.ts`, with bounded `workflow_run` and `check_run` ingestion. Preserve that provider-signature verification, project-resolution logic, and FCR's canonical reconciliation stores. The Gmail adapter is a discovery-only supplement; it **does not** create a webhook, database writer, GitHub workflow-dispatcher, secondary incident authority, or publication pipeline. Never promote email metadata into persisted canonical evidence without the existing authenticated FCR pathway and an explicitly reviewed, tested integration. Both new audit scripts do GET-only provider reads. No install or deployment has been performed.

Offline proof: `node --test .github/skills/actions-mail-audit/tests/*.mjs`. CI runs this command at the exact PR head when these files change. Mocked Gmail tests prove extraction and redaction behavior but do NOT prove that a live Gmail OAuth credential, background ingestion, Gmail quota, production webhook, or provider route is configured.
