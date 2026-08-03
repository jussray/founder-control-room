# Founder Signal Engine Remote MCP Bridge

## Purpose

Provide approved OpenAI-backed callers with a scoped invocation path into the Founder Signal Engine when the active environment lacks a native Zapier connector.

## Architecture

```text
OpenAI-backed caller
-> Founder Control Room remote MCP endpoint
-> authenticated evidence and standing-policy gate
-> private Zapier Catch Hook or approved backend orchestration
-> structured generation
-> Buffer custom schedules at generated_at + 20 minutes
-> one Gmail review digest
-> instant private reply ingress
-> provider and Founder Control Room receipts
```

The existing provider-held OpenAI key reference remains:

```text
zapier-founder-signal-engine
```

The OpenAI key authenticates the caller's OpenAI request. It is never accepted as a tool argument and does not authenticate the MCP endpoint.

## Endpoint

```text
POST {FOUNDER_API_URL}/mcp/founder-signal-engine
Authorization: Bearer {FOUNDER_SIGNAL_ENGINE_MCP_TOKEN}
Content-Type: application/json
```

The endpoint implements stateless MCP JSON-RPC and exposes one tool:

```text
invoke_founder_signal_engine
```

Connection to this endpoint is not Zapier administration, arbitrary publication authority, HubSpot mutation authority, or permission to disclose credentials.

## Invocation and authority

Supported action vocabulary:

```text
run_openai_step
queue_review_draft
publish_or_send
```

`publish_or_send` is never authorized by caller text. It becomes valid only when exact trusted evidence satisfies the server-held automation grant, middleware injects the matching grant and invocation context, and the runtime mints:

```text
standing-policy:<grantId>:<invocationId>
```

The caller cannot supply the internal authorization context. Manual approval-looking strings remain references only.

The receipt is an exact runtime correlation value backed by authenticated middleware and private provider ingress. It is not a standalone cryptographic signature.

## Scheduled distribution

After authorization, each selected finished post passes the checked-in Buffer firewall.

The firewall requires:

```text
exact source SHA
HTTPS proof URL
fresh generated_at
runtime invocation and grant
matching standing-policy receipt
approved channel and output field
schedule_policy_id: buffer-20-minute-review-v1
notification_mode: gmail_campaign_digest
```

It owns:

```text
scheduled_at = generated_at + 20 minutes
buffer_api_sharing_mode = customScheduled
buffer_api_due_at = scheduled_at
buffer_save_to_draft = false
share_now_allowed = false
```

The Zapier-facing `buffer_method: schedule` is still subject to live action-schema proof. The Buffer API-safe mapping is `customScheduled` plus `dueAt`.

## Gmail notification and private reply ingress

After Buffer returns real schedule IDs, send one Gmail digest covering up to three posts. The digest includes each caption, channel, due time, Buffer ID, review token, and a private context-bound Reply-To address.

Gmail polling is not accepted for the deadline command path. A polling trigger can consume most of a 20-minute window and cannot guarantee that a valid command is handled in time.

The preferred durable architecture is:

```text
Gmail digest
Reply-To: private address on an owned domain
-> Cloudflare Email Routing Worker
-> validate founder sender, recipient/context, token, and deadline
-> controlled edit or cancel action
```

The private reply route is a separate implementation and deployment surface. Repository configuration does not prove that DNS, Email Routing, Worker execution, or provider actions are live.

Accepted commands:

```text
cancel all
<channel>: cancel
<channel>: <requested tweak>
```

Exactly one unquoted command is accepted. Edits return to generation and firewall validation before Buffer update. No valid reply means no extra publish call; Buffer keeps the existing schedules.

## Secret boundary

Provider secrets remain only in deployed secret stores:

```text
FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON
FOUNDER_SIGNAL_ENGINE_HOOK_TIMEOUT_MS
```

The tool rejects raw keys, tokens, passwords, hook URLs, service-role fields, and unexpected secret-shaped arguments.

Do not duplicate or rotate the existing OpenAI key merely because ChatGPT lacks a native Zapier connector.

## Audit and idempotency

The caller supplies a UUID `invocationId`. Founder Control Room writes deterministic request and result audits.

Duplicate invocation IDs are blocked. After a real or uncertain external call, inspect retained evidence before retrying. Create a new invocation only when prior state proves a new attempt is appropriate.

## Proof semantics

These states are different:

1. MCP accepted.
2. Standing policy authorized.
3. Zapier hook or backend orchestration accepted.
4. Exact run identified.
5. Structured output verified.
6. Buffer custom schedules and IDs verified.
7. Gmail digest and private Reply-To verified.
8. Instant reply-ingress receipt verified.
9. Edit, cancel, compensation, or no-reply result verified.
10. Final Buffer/platform and Founder Control Room receipts correlated.

A successful HTTP response does not prove a Zapier run. A run ID does not prove Buffer, Gmail, reply ingress, publication, HubSpot mutation, or final correlation.

## Historical Day 3 source

```text
Repository: jussray/Sekret-Bip
PR: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
HubSpot deal: 337185466050
Founder Control Room issue: #73
```

Day 3 is proven and closed. The current gate is live activation of the scheduled review-window phase.

## Deployment and activation gate

Merging code does not deploy or activate it.

Live activation requires separate approval to:

1. deploy the updated backend;
2. install the MCP token, private hook URL, and automation grant;
3. verify the live webhook and orchestration topology;
4. verify the live Buffer schedule schema and exact returned IDs;
5. implement and deploy instant private reply ingress;
6. configure the Gmail digest with the bound private Reply-To;
7. run one controlled synthetic campaign;
8. prove one edit or cancel path and one no-reply path;
9. correlate Zapier/backend, Buffer, Gmail, ingress, platform, and Founder Control Room receipts.

A Free two-step Zap alone is not sufficient for this complete architecture. Gmail polling is not accepted for the 20-minute deadline path.

`share_now`, unrelated outreach, arbitrary HubSpot mutation, and unrelated provider actions remain outside this contract.

## Rollback

- disable or remove `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON`;
- disable the affected Catch Hook, Zap, backend route, and private reply route;
- cancel only identified scheduled test artifacts when real provider IDs exist;
- revoke the separate MCP token when required;
- preserve request/result audits, Zap history, mail receipts, Buffer/platform receipts, and HubSpot evidence;
- do not rotate the existing OpenAI key without a separate credential incident or approval.
