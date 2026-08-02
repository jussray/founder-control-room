# Founder Signal Engine Remote MCP Bridge

## Purpose

Provide approved OpenAI-backed callers with a real, scoped invocation path into the Founder Signal Engine when the active environment does not expose a native Zapier connector.

## Architecture

```text
OpenAI-backed caller
  uses provider-held OpenAI key reference: zapier-founder-signal-engine
        |
        v
Founder Control Room remote MCP endpoint
  POST /mcp/founder-signal-engine
  tool: invoke_founder_signal_engine
        |
        v
Authenticated Founder Signal middleware
  exact evidence + server-held standing-policy gate
        |
        v
Private Zapier Catch Hook
        |
        v
Zapier -> structured generation -> Buffer 20-minute schedules
       -> one Gmail review digest -> receipts
```

The OpenAI API key authenticates the caller's OpenAI request. It is never sent as a tool argument and does not authenticate the MCP endpoint.

The MCP endpoint uses a separate bearer token. The private Zapier hook URL and automation grant remain in the deployed backend secret store.

Connection to this path is not Zapier administrator access, a Zapier history viewer, arbitrary publication authority, HubSpot mutation authority, or permission to disclose credentials.

## Endpoint

```text
POST {FOUNDER_API_URL}/mcp/founder-signal-engine
Authorization: Bearer {FOUNDER_SIGNAL_ENGINE_MCP_TOKEN}
Content-Type: application/json
```

The endpoint implements stateless MCP JSON-RPC for:

```text
initialize
notifications/initialized
ping
tools/list
tools/call
```

It exposes exactly one tool:

```text
invoke_founder_signal_engine
```

## OpenAI remote MCP configuration

The caller keeps `OPENAI_API_KEY` or the existing provider-managed key outside the repository. An OpenAI request may attach the MCP endpoint with configuration equivalent to:

```ts
const response = await openai.responses.create({
  model: process.env.OPENAI_MODEL ?? 'gpt-5',
  input: 'Invoke the Founder Signal Engine for the verified GitHub source.',
  tools: [
    {
      type: 'mcp',
      server_label: 'founder_signal_engine',
      server_url: `${process.env.FOUNDER_API_URL}/mcp/founder-signal-engine`,
      allowed_tools: ['invoke_founder_signal_engine'],
      require_approval: 'always',
      headers: {
        Authorization: `Bearer ${process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN}`,
      },
    },
  ],
});
```

This example contains no live credentials. Do not replace placeholders in repository files.

## Tool input

Base invocation shape:

```json
{
  "invocationId": "caller-generated UUID",
  "sourceRepository": "jussray/Sekret-Bip",
  "sourcePr": 599,
  "sourceCommitSha": "f4573d360a8fea99b301f33a2a21192525725f7b",
  "requestedAction": "run_openai_step",
  "steeringGrantId": "founder-signal-engine-day3-proof",
  "auditPath": "Founder Control Room issue #73",
  "rollbackStep": "Disable the Zapier Catch Hook and retain the evidence trail.",
  "requestingAgent": "chatgpt",
  "allowHubSpotWrite": false,
  "founderApprovalId": null
}
```

Supported action vocabulary:

```text
run_openai_step
queue_review_draft
publish_or_send
```

`publish_or_send` is not authorized by caller text. It becomes valid only when the server-held automation grant and exact trusted evidence select `auto-distribute`, middleware injects the matching grant and invocation context, and the runtime mints:

```text
standing-policy:<grantId>:<invocationId>
```

The caller cannot supply or forge the internal authorization context. The route rejects mismatched standing-policy receipts.

Manual approval-looking strings remain references only. They do not become executable authority merely because they are present in `founderApprovalId`.

## Standing-policy evidence

The automation candidate must include the exact supported channel, audience segment, HTTPS proof URL, and complete 5W1H context expected by the gate.

The server-held grant remains authoritative for:

- enabled/disabled state;
- allowed repositories;
- allowed channels;
- allowed audience segments;
- allowed actions;
- source-evidence age;
- trusted proof domains;
- rollback and audit paths.

The deterministic receipt is an exact runtime correlation value. The authenticated backend middleware and private Zapier hook are the security boundary. The receipt is not a standalone cryptographic signature and must not be accepted outside that trusted path.

## Scheduled distribution contract

After standing-policy authorization, Zapier must map selected finished content through the checked-in Buffer firewall.

The firewall requires:

```text
exact source SHA
HTTPS proof URL
fresh generated_at
runtime invocation and grant
matching standing-policy receipt
approved content field and channel
schedule_policy_id: buffer-20-minute-review-v1
notification_mode: gmail_campaign_digest
```

It owns the provider fields and computes:

```text
scheduled_at = generated_at + 20 minutes
buffer_method = schedule
share_now_allowed = false
```

After Buffer returns real schedule IDs, the Zap sends one Gmail digest covering up to three posts. Edit and cancel replies are accepted only from the founder mailbox, in the original Gmail thread, with the matching review token, before the deadline.

No valid reply means no extra publish action. Buffer keeps the existing schedules.

## Secret boundary

The tool rejects:

- raw OpenAI keys;
- bearer tokens;
- Zapier hook URLs;
- API-key, password, secret, token, or service-role fields;
- unexpected tool arguments.

Provider secrets are configured only as deployed backend environment variables:

```text
FOUNDER_SIGNAL_ENGINE_MCP_TOKEN
ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL
FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON
FOUNDER_SIGNAL_ENGINE_HOOK_TIMEOUT_MS
```

The existing OpenAI key reference remains:

```text
zapier-founder-signal-engine
```

Do not create, rotate, or duplicate that key merely because ChatGPT lacks a native Zapier connector.

## Audit and idempotency

The caller supplies a UUID `invocationId`. Founder Control Room writes a deterministic request audit before the provider call and a deterministic result audit after it.

Duplicate request audit IDs are blocked. Retrying after a real or uncertain provider call requires inspecting prior evidence first. Use a new invocation ID only when the prior state proves a new attempt is appropriate.

## Proof semantics

These states are intentionally different:

1. **MCP accepted:** the remote tool received and validated the request.
2. **Policy authorized:** trusted evidence satisfied the server-held standing grant.
3. **Zapier hook accepted:** Zapier returned a successful HTTP response.
4. **Zapier run identified:** an explicit matching Zapier run ID exists.
5. **Structured output verified:** expected 5W1H and platform-specific copy exist.
6. **Buffer schedules verified:** real Buffer schedule IDs and fire times exist.
7. **Gmail review verified:** one digest, thread ID, sender binding, token, and deadline exist.
8. **Review outcome verified:** edit, cancel, compensation, or no-reply result is retained.
9. **Distribution proof complete:** final Buffer/platform and Founder Control Room receipts correlate to the exact invocation.

A successful HTTP response without an explicit run ID does not prove Zapier execution.

A Zapier run ID alone does not prove structured output, Buffer schedules, Gmail delivery, publication, HubSpot mutation, or final correlation.

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

1. deploy the updated Founder Control Room backend;
2. install the separate MCP bearer token;
3. install the private Zapier Catch Hook URL;
4. install and validate the server-held automation grant;
5. confirm the live Zapier plan supports the required webhook and multi-step workflow;
6. remap the existing Zap to the exact checked-in firewall and review controller;
7. return or log explicit Zapier, Buffer, Gmail, and final provider receipts;
8. run one controlled synthetic campaign;
9. verify edit/cancel and no-reply behavior without duplicates;
10. correlate every artifact in Founder Control Room.

`share_now`, unrelated outreach, arbitrary HubSpot mutation, and unrelated provider actions remain outside this contract.

## Rollback

- disable or remove `FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON`;
- disable the affected Zap or Catch Hook;
- cancel only identified scheduled test artifacts when real provider IDs exist;
- revoke the separate MCP bearer token when required;
- preserve request/result audits, Zap history, Gmail receipts, Buffer receipts, platform receipts, and HubSpot evidence;
- do not rotate the existing OpenAI key unless a separate credential incident or founder approval requires it.
