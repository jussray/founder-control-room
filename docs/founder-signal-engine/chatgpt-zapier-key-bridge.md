# ChatGPT and Zapier: OpenAI Developers Key Bridge

## Founder intent

ChatGPT does not currently have a directly invokable Zapier connector in every environment. Claude or another agent may have a native Zapier connector, but ChatGPT and other agents without that connector still need a documented, safe route into the Founder Signal Engine workflow.

The canonical fallback is the existing OpenAI Developers / OpenAI Platform connection named:

```text
zapier-founder-signal-engine
```

This connection is the approved OpenAI credential used by the preconfigured Zapier workflow. The raw key is never exposed to the acting agent.

## Exact boundary

The OpenAI API key does **not** become a Zapier administrator token and does not let an agent inspect arbitrary Zapier screens or edit arbitrary Zaps by itself.

Instead, the key powers the OpenAI step or an approved bridge endpoint that has already been wired to the named Founder Signal Engine Zap. In practical terms:

```text
ChatGPT or another agent without a native Zapier connector
-> @OpenAI Developers / approved OpenAI API bridge
-> preconfigured Founder Signal Engine Zapier workflow
-> OpenAI 5W1H step
-> Buffer review queue
-> HubSpot evidence
-> Founder Control Room proof
```

The bridge must be preconfigured and scoped. Calling OpenAI with the key alone does not magically discover or control Zapier.

## Agent rule

When an agent needs to use the Founder Signal Engine:

1. Look for a direct Zapier, automation, browser-control, MCP, or equivalent connector.
2. If a direct connector exists, use it within the named Zap and audit scope.
3. If no direct connector exists, use the approved `@OpenAI Developers` / OpenAI API bridge that is already wired to the named Zap.
4. If neither path exists, stop and record a blocked direct-control path. Do not pretend the workflow ran.

## ChatGPT-specific rule

For ChatGPT in an environment without a native Zapier connector:

- use `@OpenAI Developers` as the OpenAI-side connection;
- target the existing `zapier-founder-signal-engine` connection;
- call only the approved bridge or action that is already wired to the Founder Signal Engine Zap;
- never create a replacement key unless Ray explicitly requests one;
- never reveal, paste, log, screenshot, or commit the raw key;
- never claim Zapier, Buffer, HubSpot, or social publication passed without run evidence.

## Agents without native Zapier access

Any approved agent without a native Zapier connector follows the same fallback:

```text
No native Zapier connector
-> approved OpenAI Developers key reference
-> approved bridge or prewired Zapier action
-> named Founder Signal Engine Zap only
```

The key reference must be provider-held. It is not copied into prompts, files, CRM records, screenshots, logs, or chat.

## Required request envelope

Every bridge request must include:

```text
Workflow: Founder Signal Engine
Zap ID or canonical workflow name:
Source repository:
Source PR or commit SHA:
Requested action:
Steering grant ID:
Audit destination:
Founder approval ID when external publication or CRM mutation is requested:
Rollback or disable step:
```

## Allowed fallback actions

Without a native Zapier connector, an approved bridge may:

- submit verified GitHub evidence to the named workflow;
- request the OpenAI 5W1H generation step;
- request creation of a review-only Buffer item when the send gate permits it;
- request a deal-associated HubSpot proof record when separately approved;
- return run identifiers and evidence references.

It may not:

- enumerate or edit unrelated Zaps;
- widen trigger scope silently;
- publish externally without the exact founder gate;
- change credentials, billing, ownership, or provider connections;
- delete runs, drafts, CRM records, or evidence.

## Evidence required

A successful call must return or lead to:

1. exact source PR or commit SHA;
2. bridge request ID;
3. Zapier run ID and status;
4. OpenAI 5W1H result without secrets;
5. Buffer artifact and state, if created;
6. HubSpot record URL, if separately approved and written;
7. Founder Control Room evidence link;
8. no raw key in retained artifacts.

## Current Day 3 truth

PR `jussray/Sekret-Bip#599` was reviewed and merged as a GitHub trigger. That merge is not proof that the bridge, Zapier, OpenAI, Buffer, or HubSpot completed. The remaining proof gate is still the matching external run and its artifacts.

## Rollback

Disable the named Zap or bridge route, revoke the scoped steering grant, invalidate queued Buffer items, and mark HubSpot evidence as invalidated. Preserve the evidence trail. Rotate the key only when compromise, explicit founder instruction, or provider policy requires it.
