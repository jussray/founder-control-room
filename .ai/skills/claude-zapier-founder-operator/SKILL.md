# Claude Zapier Founder Operator

## Use this skill when

- Claude has a connected Zapier MCP or another declared Zapier control surface.
- The founder asks Claude to inspect, repair, run, or verify the Founder Signal Engine.
- The task crosses Gmail, GitHub, HubSpot, Buffer, Zapier, or saved Zapier MCP skills.
- Claude must distinguish a conversational MCP run from an always-on event Zap.

Read [`CLAUDE.md`](../../../CLAUDE.md), [`docs/founder-signal-engine/claude-zapier-operator.md`](../../../docs/founder-signal-engine/claude-zapier-operator.md), and [`docs/founder-signal-engine/zapier-steering-authority.md`](../../../docs/founder-signal-engine/zapier-steering-authority.md) before acting.

## Provider routing truth

Claude's connected Zapier MCP is a direct operator path for the actions the MCP exposes.

The OpenAI Developers bridge remains valid and operational. ChatGPT's present limitation is the absence of a direct Zapier MCP connection, not a failure of the OpenAI bridge.

```text
Claude + Zapier MCP
-> direct scoped operator path

ChatGPT without Zapier MCP
-> OpenAI Developers bridge
-> approved Founder Signal Engine invocation path
```

The paths complement each other. Do not describe Claude as replacing the OpenAI bridge. Do not describe the OpenAI bridge as granting direct Zapier administration.

## Authority

Claude is a first-class Founder Signal Engine operator only within the tools and scope exposed by the connected Zapier MCP.

Connection does not grant publication, credential, billing, deletion, deployment, merge, or unrelated-account authority.

## Required procedure

1. Identify the exact workflow, saved skill, accounts, source event, and founder-approved scope.
2. Prefer updating an existing saved skill such as `founder rundown` over creating a duplicate.
3. Extract exact identifiers from each source.
4. Cross-reference the identifiers through the next authoritative source.
5. Separate VERIFIED, INFERRED, and UNKNOWN.
6. Use one allowed incident classification when handling failures.
7. For always-on work, verify that a published event Zap exists.
8. Keep the first live path review-only with `PUBLISH_ALLOWED: false`.
9. Write results back to the same HubSpot deal when CRM write is approved.
10. Require artifact-level proof before claiming completion.

## Incident classifications

```text
ACTIVE_FAILURE
HISTORICAL_FAILURE
STALE_NOTIFICATION
INFRASTRUCTURE_FAILURE
RESOLVED
UNRESOLVED
```

Never classify an email as stale merely because a pull request is closed.

## Required output

```text
REALITY
FIX
PROOF
RISK
ROLLBACK
NEXT GATE
```

## Proof minimum

- exact source identifiers;
- Zapier run ID and status when exposed;
- Claude structured result;
- HubSpot note or task associated with the intended deal;
- returned Buffer artifact if Buffer was invoked;
- exact failure stage when incomplete.

## Safety

- Never expose raw secrets.
- Never claim an unavailable Buffer read returned an empty queue.
- Never publish or contact anyone without exact founder approval.
- Never create duplicate skills, Zaps, records, or public actions merely to produce visible activity.
- Never delete founder material.
