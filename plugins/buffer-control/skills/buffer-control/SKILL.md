---
name: buffer-control
description: Govern Buffer publishing for Juss-owned campaigns. Use for Buffer channel discovery, draft/queue/schedule requests, approved campaign creative selection, post readback, and performance checks.
---

# Buffer Control

## Purpose

Use Buffer as the external distribution transport while preserving Founder Control Room and Chief as the authority/evidence layer. Do not let Buffer become the source of product truth, campaign intent, or founder approval.

## Authority order

1. Current explicit founder instruction in the active conversation.
2. Current FCR campaign/content ledger and receipts when available.
3. Approved campaign creative/copy canon.
4. Prior campaign state.
5. Inference.

Never turn inference into posting authority.

## Connection

Use the `buffer` MCP server at `https://mcp.buffer.com/mcp`. Prefer the server's OAuth flow so authentication is established directly between the MCP client and Buffer. Never ask for, print, store, summarize, or echo Buffer credentials in model-visible content.

The plugin manifests intentionally contain no Buffer bearer token or API key. If a non-OAuth runtime is separately configured to use a Buffer API key, that credential must remain an external runtime secret and must not be added to this package.

On the first Buffer action in a conversation, use `get_account` and `list_channels` only when the needed organization/channel IDs are not already present in trustworthy current context. Reuse returned IDs instead of repeatedly looking them up.

## Posting rules

- Prefer Buffer's named tools such as `create_post`, `edit_post`, `list_posts`, and `get_post` over generic GraphQL mutation tools.
- One Buffer post belongs to one channel. For a multi-channel campaign, create one bounded post per approved channel and retain each returned post ID.
- `shareNow` requires an explicit current instruction to publish now.
- If the founder says to post through Buffer but gives no exact time, use `addToQueue`. Do not silently reinterpret that as `shareNow`.
- If a precise future time is given, use `customScheduled` with the exact resolved timestamp.
- If the request is review/draft-only, set `saveToDraft: true` when the tool supports it, or use Buffer's draft action/state rather than queueing or publishing.
- Do not use delete actions unless the founder explicitly requests deletion in the current conversation.
- Do not silently drop requested media. If an approved asset cannot be supplied to Buffer as a usable asset URL/reference, stop that channel's write and report `MEDIA_TRANSPORT_BLOCKED` rather than substituting a text-only post.
- Never regenerate an approved campaign visual merely because transport is blocked. Preserve the approved asset and repair transport instead.

## Approved creative canon

When a campaign has multiple founder-approved creatives, choose among the approved set according to channel, audience, placement, and conversion goal. Do not treat variants as interchangeable and do not generate replacements unless explicitly requested.

For the current `JUSS SITE AUTOPSY` campaign, the approved set is the three cinematic black/red variants with the clinical/noir/cyber-noir visual language, high-contrast typography, crimson EKG motif, premium conversion pull, and CTA `DM "AUTOPSY"`. These are the current accepted campaign visuals. Use them accordingly; do not regenerate them without a new founder instruction.

## JUSS SITE AUTOPSY routing

When the campaign is `JUSS SITE AUTOPSY`:

- Preserve the $49 offer and `DM "AUTOPSY"` conversion path unless the founder changes them.
- Use platform-specific copy rather than blindly duplicating one caption everywhere.
- Keep the visual promise and post copy aligned. Do not claim a service capability that is not actually offered.
- If asked to post "accordingly" with no time, prefer each target channel's Buffer queue rather than immediate publication.

## Evidence and receipts

After each successful Buffer write, retain at minimum:

- organization ID when returned or already authoritative,
- channel ID and service,
- Buffer post ID,
- resulting status,
- due time when scheduled,
- exact text used or its stable hash when a receipt layer is available,
- asset identifiers/URLs used,
- allowed actions returned by Buffer,
- timestamp of the tool result.

A successful `create_post` response is the first provider receipt. Do not call a post live merely because a request was sent. For scheduled/queued content, state `BUFFER_ACCEPTED` or `SCHEDULED`; reserve `POSTED` for provider evidence showing it was sent/published.

When FCR receipt persistence is available in the host environment, bind the Buffer result into the campaign/content ledger with the provider post ID, channel, content fingerprint, campaign identity, current founder intent, and supersession lineage. If FCR receipt persistence is unavailable, report that gap rather than inventing a receipt.

## Readback and analytics

Use the Buffer post returned by a successful create/edit call instead of immediately rereading it. Use `get_post` when state may have changed or information is missing. Use `list_posts` for queue/draft review and Buffer analytics tools for outcome checks.

Treat analytics as learning evidence, not publication authority. Compare reach, engagement, clicks, profile actions, inbound conversations, and concrete conversion outcomes when the platform exposes them.

## Stop conditions

Stop and report the blocker instead of writing when any of these is true:

- no authenticated Buffer MCP connection,
- target channel is ambiguous or disconnected,
- requested media is unavailable to Buffer,
- exact founder instruction conflicts with stored campaign state,
- the requested write would require `shareNow` without explicit current authorization,
- provider response is unknown or contradictory.

Never hide a failed or unknown provider outcome behind a success message.
