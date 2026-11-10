# Granola ↔ FCR / Claude / ChatGPT

State: **source implementation on review branch only**. No Granola account connection, note access, migration, webhook registration, or production activation has been verified.

## Client boundaries

- **FCR:** server-side Granola REST API for founder-only, explicitly requested reads under the existing Plugin Center founder-authenticated router.
- **Claude / ChatGPT:** each individual authorizes their own Granola MCP connection using OAuth. Do not copy OAuth access tokens into FCR or share an API key between clients.
- **Claude Code:** set up the Granola HTTP MCP endpoint through the official Granola instructions; authenticate the individual session interactively.
- **AI inbox / HubSpot / Linear / Notion / Gmail:** no data forwarding, message sending, CRM mutation, or task creation is performed by this phase. Those require distinct founder approvals and receipt-backed provider checks.

## FCR API routes

All paths below require the existing FCR founder authentication. The integration stays disabled until all server-side settings are valid.

| Route | Output |
|---|---|
| GET /plugin-center/granola/status | Configured flag, read-only state; always reports liveProviderVerified=false |
| GET /plugin-center/granola/notes | At most 10 note IDs, titles, updated timestamps and pagination cursor |
| GET /plugin-center/granola/notes/:noteId/summary | One selected note's summary, only after exact folder-membership validation |

Required backend environment:

- GRANOLA_API_KEY — personal API key with minimum needed personal-note scope, kept **only** in server-side secret storage.
- GRANOLA_ALLOWED_FOLDER_ID — exact authorized folder ID (Granola's folder filter includes child folders).
- GRANOLA_READ_ENABLED=true — **only after** independent authorization, source review, and safe test-folder proof. Unset or false by default.

Do not enable a workspace API key for this adapter. A key's access scope is broader than the per-folder application policy. Use a dedicated test folder with no children until source and live-proof gates pass.

Granola's List Notes folder query includes child folders; the list route therefore returns limited metadata for the selected folder subtree. Get Summary separately demands an **exact** folder membership and denies an out-of-scope or deleted note. No transcript request is made (the include=transcript parameter is never sent); private_notes, meeting invitees, and complete upstream responses are never returned to the browser.

## Webhooks / AI inbox follow-up

The signature-verification helper is deliberately **unmounted**. It does not process, store, or fetch any event. A future implementation must first add durable event_id replay deduplication, bounded queue processing, folder-scope checks, content-free receipts, and authorization for downstream review-only proposals. Signed events alone do not authorize automation.

## Verification and release gates

1. Run npm test, npm run lint, npm run typecheck, and npm run build against the exact candidate SHA in the repository. Review any red checks; do not mark production ready from local source tests.
2. Use non-sensitive test notes in a specifically approved folder. Verify no private notes, transcripts, attendee data, credentials, or other folders are returned.
3. Independently confirm source SHA, CI SHA, Worker SHA, and provider behavior. Unknown provider access remains blocked.
4. Obtain exact-candidate founder-final authorization before any merge, and separately authorize deployment, credentials, webhook setup, or data movement.

Rollback: leave or set GRANOLA_READ_ENABLED=false. If a key was ever provisioned, revoke it using Granola's key settings. No database migration, destructive operation, or background task is included.

Official docs:
- https://docs.granola.ai/llms.txt
- https://docs.granola.ai/api-reference/list-notes
- https://docs.granola.ai/api-reference/get-note
- https://docs.granola.ai/help-center/sharing/integrations/mcp
- https://docs.granola.ai/webhooks
