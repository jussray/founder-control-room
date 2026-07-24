# Founder Signal Engine Remote MCP Bridge

## Purpose

Provide ChatGPT and other approved OpenAI-backed agents with a real, scoped invocation path into the Founder Signal Engine when the active environment does not expose a native Zapier connector.

## Architecture

```text
OpenAI API caller
  uses existing provider-held key reference: zapier-founder-signal-engine
        |
        v
Remote MCP server
  POST /mcp/founder-signal-engine
  tool: invoke_founder_signal_engine
        |
        v
Founder Control Room audit-first bridge
        |
        v
Private Zapier Catch Hook
        |
        v
Zapier -> OpenAI 5W1H -> Buffer -> HubSpot -> Founder Control Room proof
```

The OpenAI API key authenticates the caller's OpenAI request. It is not sent to this MCP endpoint and is never accepted as a tool argument. The remote MCP endpoint uses a separate bearer token, and the private Zapier hook URL stays in the deployed backend secret store.

## Endpoint

```text
POST {FOUNDER_API_URL}/mcp/founder-signal-engine
Authorization: Bearer {FOUNDER_SIGNAL_ENGINE_MCP_TOKEN}
Content-Type: application/json
```

The endpoint implements stateless MCP JSON-RPC for:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

It exposes exactly one tool:

```text
invoke_founder_signal_engine
```

## OpenAI remote MCP configuration

The caller keeps `OPENAI_API_KEY` or the existing provider-managed key outside the repository. A Responses API request can attach the remote MCP server using configuration equivalent to:

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

Allowed actions:

- `run_openai_step`
- `queue_review_draft`
- `publish_or_send`

`publish_or_send` and any request with `allowHubSpotWrite: true` require a non-empty exact `founderApprovalId`.

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
FOUNDER_SIGNAL_ENGINE_HOOK_TIMEOUT_MS
```

The existing OpenAI key reference remains:

```text
zapier-founder-signal-engine
```

Do not create, rotate, or duplicate that key merely because ChatGPT lacks a native Zapier connector.

## Audit and idempotency

The caller supplies a UUID `invocationId`. Founder Control Room writes a deterministic request audit before the provider call and a deterministic result audit after it.

Duplicate request audit IDs are blocked. Retrying after a real or uncertain provider call requires inspecting the prior evidence first and then using a new invocation ID only when appropriate.

## Proof semantics

These states are intentionally different:

1. **MCP accepted:** the remote tool received and validated the request.
2. **Zapier hook accepted:** Zapier returned a successful HTTP response.
3. **Zapier run identified:** an explicit Zapier run ID was returned.
4. **Day 3 proof complete:** the Zapier run ID, OpenAI 5W1H output, Buffer artifact, HubSpot deal-associated evidence, and Founder Control Room evidence all exist.

A successful HTTP response without an explicit run ID does not complete Day 3. The invocation ID must be located in Zapier history and associated with the real run receipt.

## Current Day 3 source

```text
Repository: jussray/Sekret-Bip
PR: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
HubSpot deal: 337185466050
Founder Control Room issue: #73
```

## Deployment and activation gate

Merging this endpoint does not deploy or activate it. Live activation requires separate approval to:

1. deploy the updated Founder Control Room backend;
2. add the separate MCP bearer token to the backend secret store;
3. add the private Zapier Catch Hook URL to the backend secret store;
4. configure the Zap to return or log an explicit run receipt;
5. register the deployed MCP endpoint with the authorized OpenAI caller;
6. invoke the Day 3 source and capture the downstream evidence.

No raw credentials belong in GitHub, HubSpot, Buffer, screenshots, chat, or Founder Control Room evidence.

## Rollback

- remove or disable the remote MCP route at the deployment layer;
- revoke the separate MCP bearer token;
- disable the Zapier Catch Hook or Zap;
- preserve request and result evidence;
- do not rotate the existing OpenAI key unless a separate credential incident or founder approval requires it.
