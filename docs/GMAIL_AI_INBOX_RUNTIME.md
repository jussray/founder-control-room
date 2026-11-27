# Gmail AI Inbox — scoped observation runtime

**State:** candidate source in PR #948. No claim of live Gmail access, OAuth consent, Cloudflare deployment, persistent sync, or provider readback.

## What the runtime actually does

- A founder-authenticated, explicitly requested `GET /plugin-center/messaging/ai-inbox` reads only Gmail header metadata for a single configured mailbox and **both** the `INBOX` label and a pinned custom business label.
- It checks the authenticated Gmail profile against the pinned account, verifies message/thread identity and label membership, caps each page at 25 messages, and provides a bounded cursor.
- It returns account-scoped deduplicated **observation-only** triage. A reply signal is a *candidate*, not a verified substantive buyer, investor, government, or customer response.
- A separate on-demand `GET /plugin-center/messaging/ai-inbox/probe?projectSlug=<pinned-slug>` checks the exact Gmail account and custom label using only `profile` and `labels.get`; this proves those provider reads at request time, not inbox ingestion, OAuth installation, or deployment.
- Opt-outs receive suppression review priority. Automated notices are not treated as human replies. Financial/CI notices remain unverified until independent provider reconciliation.
- It reads no message bodies, attachments, or private Se'kret Bip product data; performs no automated search, webhook subscription, persistence, archive, delete, read-marking, reply, or outreach send.
- The pre-existing founder-approved `POST /plugin-center/messaging/reply` remains a **separate** action requiring an exact one-reply approval, idempotency and audit. A configured label also restricts that reply's original message, and configured project scope must match.

## Source-level configuration (server-side only)

- `FCR_GMAIL_EXPECTED_EMAIL`: explicit mailbox identity.
- `FCR_GMAIL_INBOX_PROJECT_SLUG`: explicit business/project route.
- `FCR_GMAIL_INBOX_LABEL_ID`: **custom** label ID (`Label_...`), not broad `INBOX`.
- OAuth token via `FCR_GMAIL_ACCESS_TOKEN` or the existing server-only `FCR_GMAIL_REFRESH_TOKEN`, `FCR_GMAIL_CLIENT_ID`, `FCR_GMAIL_CLIENT_SECRET`.
- Gmail **metadata read** scope (such as `gmail.metadata`) is required for this reader; reply sending separately requires authorized Gmail send scope. Google OAuth consent/verification obligations remain provider gates. Setting variables alone proves neither scope nor provider access.
- Never paste tokens, inbox contents, secret values or personal contact lists into source, GitHub Actions, issues or receipts.

## HTTP flow

1. `GET /plugin-center/messaging/ai-inbox/status` gives *presence-only* readiness.
2. Founder explicitly requests `GET /plugin-center/messaging/ai-inbox?projectSlug=<pinned-slug>&maxResults=15` (optionally `pageToken` from the prior response).
3. No query can override the configured mailbox, label or project. Wrong project, missing config, invalid pagination or conflicting message metadata fail closed.
4. Response is a metadata snapshot. No AI-generated recommendation, content verification, CRM status, or Gmail execution is implied.
   The probe endpoint performs no `messages.list`, `messages.get`, or send; it is not a background health monitor.
5. An operator reviews the thread and independently verified outbound history/consent before treating a possible response as substantive or authorizing a **separate** reply.

## Founder communication boundaries

Inbound and previously contacted substantive replies take priority over new prospect batches. Suppression and opt-out reviews block new sends. Project and purpose consent cannot cross brands. Commercial outreach, investor/funding, government correspondence, support and existing customer conversations have distinct authority and outcome ledgers. No unrestricted cold outreach, automatic follow-up, resend, alternate-channel contact, material promises, publication, spending or autonomous Gmail sends are enabled by this feature.

## Proof and limitations

Focused verification: `npx vitest run src/lib/__tests__/aiInboxRouting.test.ts src/lib/__tests__/growthInboxReply.test.ts src/http/routes/__tests__/pluginCenterMessaging.integration.test.ts`; `npm run typecheck`; `npm run lint`; exact-head repository CI. Live OAuth scopes, custom Gmail label, Worker bindings, provider response and founder browser proof require separate authorized observations.

**Uncertain outbound send:** if the Gmail send boundary or provider readback cannot prove delivery, the HTTP result is `GMAIL_SEND_OUTCOME_UNKNOWN` with `reconciliationRequired: true`. The `approval_executions` row remains `pending`. A server-derived `growth-reply:v1:<hash>` reservation binds the source mailbox, project, channel and original inbound message ID, so a changed client idempotency key or revised reply body cannot silently produce a second send for that same inbound message. A separate independent Gmail Sent/readback and founder decision are required before any additional send attempt; changing the idempotency key is not proof that resending is safe. The PostgreSQL uniqueness of `approval_executions.idempotency_key` provides atomic deduplication for **new** reservations using this key. Existing historical rows that used arbitrary client keys are not automatically migrated or reconciled by source changes; an authorized rollout must inspect old pending sends before enabling the new path.

**Not implemented:** multi-account runtime binding, OAuth installation, scheduled ingestion, durable idempotent inbox cursor, thread-to-contact/outreach registry join, substantive reply verification, model drafting or automatically generated response text. ChatGPT-connected Gmail is not transferable authorization to FCR. Do not advertise these as live.

## GitHub portfolio notification reconciliation (candidate)

GitHub billing and account-security notices require operator review. GitHub workflow outcomes (including success, failure, cancellation and skips) and PR conversation updates require independent provider reconciliation; header classification is not sender authentication, current CI evidence, or closure. A successful notification for an earlier head must never clear a current failure. Review requests and bot comments need current PR/review readback; metadata alone cannot identify a review's substantive findings.

Reuse the existing portfolio watch in #1026 and task routing contract #918; do not create another scheduler. To activate scheduled GitHub email triage, the existing carrier must obtain explicit account/label-scoped OAuth consent, persist per-mailbox cursor and message dedupe state privately, resolve repositories against the authorized project registry, read current GitHub PR/check/run state, and track material unresolved items until independently verified closure. Route billing/security/account authorization decisions to the founder; no automatic spending, credential changes, merges, deployment, or email replies. Do not export raw mail, addresses, message IDs, or provider tokens into repositories or public receipts.

Acceptance: demonstrate an authorized metadata read, a controlled new failure and matching provider readback, unchanged duplicate suppression across repeated polls, no closure on a stale successful head, verified closure on the current head, and delivery through the existing approved notification carrier. Until these are observed, scheduled monitoring is BLOCKED/UNVERIFIED, not active.

### Explicit current-provider readback (candidate)

A founder may opt in to the existing read-only inbox endpoint with `reconcileGithub=true` and the already pinned project slug. This reduces the page limit to five messages. A registered, active, verification-enabled GitHub project must match the repository in the header; a different project, fork head, ambiguous PR workflow title, invalid branch, mismatched provider SHA or moving ref fails closed. A PR conversation with a number can be read via the existing provider observation and review methods; branch-run notifications require the current full branch SHA to match the abbreviated header SHA. The check snapshot is queried by full SHA and the mutable identity re-read afterward.

The optional `githubReconciliation` array aligns with the returned messages. Results contain bounded status/counts and project identity, not raw mail or provider errors. `observed` means only a current provider snapshot, not incident resolution, review approval, complete required-check coverage, or deployment proof; all results retain `resolution: unverified`. No writes to GitHub, Gmail, or the event ledger occur. The current label remains single-project: portfolio-wide scheduled ingestion, durable incident tracking, deduplication across polls, ambiguous workflow-run/PR resolution, and notification delivery still require separate implementation and authorization.

### Hourly durable intake (candidate, disabled by default)

The existing Worker cron invokes the GitHub inbox watch only on the top-of-hour tick and only if the separate server-side flag `FCR_GMAIL_GITHUB_WATCH_ENABLED=true` is explicitly set after authorized Gmail consent and scope verification. It reuses the existing single mailbox, project, and custom label bindings; checks the active repository registry and provider profile/label; and processes at most three five-message pages. Each cycle restarts at the first page. A remaining page token is reported as truncated coverage, not silently treated as complete. The watch never modifies Gmail or invokes repository write methods.

The existing `provider_events` unique provider/event identity is the durable deduplication boundary. Events use provider `control-room`, never `github`, and event types `github_mail_intake` and `github_mail_observation`. A scope-bound message hash links intake to immutable provider snapshots; identical snapshots deduplicate, while a distinct observed state retains a new receipt. No raw headers, mailbox addresses, message IDs, page tokens or provider exception text are retained. Account billing/security signals are marked account-scope review rather than repository failures. Other repository messages are excluded. All receipts remain unresolved/pending and are not signed GitHub events, release evidence, approval, or proof of notification delivery.

Known limits: the current adapter reads the intersection of INBOX and the pinned label; pagination is bounded and restarts each hour, so backlog/archived mail coverage and transition replay are incomplete. Durable cursor/history synchronization, portfolio-wide mailbox binding and a consumer to track incident resolution and deliver material founder alerts remain unimplemented. Distinct snapshots are deduplicated by content, not a complete chronological transition history. No Chief/AutoFix dispatch or notification sending is enabled. The feature flag is not set by this source change. Before activation verify Worker binding presence and authorization, the existing ledger schema and unique constraint, real scheduled polling, controlled repeated intake, current-head observation and downstream receipt delivery; disable the flag to stop polling. Do not enable without the explicit scope and activation approval.
