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
