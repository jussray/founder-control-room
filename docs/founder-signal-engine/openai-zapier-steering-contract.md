# OpenAI Developers and Zapier Steering Contract

## Goal

Allow connected ChatGPT, Codex, Claude, and OpenAI-backed agents to inspect, repair, test, and run the Founder Signal Engine Zapier workflow through explicit, least-privilege control paths.

The ChatGPT-specific fallback is defined in [`chatgpt-openai-developers-zapier-fallback.md`](./chatgpt-openai-developers-zapier-fallback.md).

## Core distinction

Zapier steering has two separate planes:

1. **Credential plane:** the dedicated OpenAI Platform key lets the OpenAI step inside Zapier call an approved model.
2. **Control plane:** a Zapier, automation, browser-control, MCP, Catch Hook, webhook bridge, or equivalent connector lets an acting agent inspect, invoke, or operate the Zapier workflow.

A configured Zapier OpenAI connection may use the dedicated key without exposing the raw key to the acting agent. **Key possession alone is not a Zapier control surface or administration surface.** A connector alone does not prove that the OpenAI action is authenticated.

## ChatGPT fallback rule

ChatGPT currently has no native Zapier connector in this environment. Therefore ChatGPT must:

1. use `@OpenAI Developers` as the secure OpenAI key/model path;
2. reference the existing `zapier-founder-signal-engine` key rather than create a replacement;
3. invoke the named Founder Signal Engine Zap through an approved Catch Hook, webhook bridge, secure Zapier UI path, MCP action, browser-control path, or equivalent authorized trigger;
4. retain the Zapier run ID and downstream evidence before claiming success.

```text
ChatGPT
-> @OpenAI Developers
-> existing zapier-founder-signal-engine key reference
-> approved Zapier trigger or bridge
-> Founder Signal Engine Zap
```

The OpenAI key is the credential connection used by Zapier for OpenAI execution. It is not, by itself, proof that Zapier received or ran the request.

## Steering authority matrix

| Available path | Allowed steering | Proof limit |
|---|---|---|
| Scoped Zapier/control connector plus an active dedicated OpenAI connection | Inspect, edit, test, and run the controlled Zap; repair trigger scope and mappings; verify OpenAI output; create review-first Buffer and deal-associated HubSpot evidence. | Retain exact run evidence and obey the 5W1H send gate. |
| ChatGPT `@OpenAI Developers` key path plus an approved Catch Hook or webhook bridge | Invoke the preconfigured Founder Signal Engine workflow and verify the OpenAI action through retained Zapier evidence. | Cannot inspect or edit arbitrary Zap structure unless the bridge explicitly exposes those capabilities. |
| Scoped Zapier/control connector without an active OpenAI connection | Inspect and repair non-OpenAI workflow structure and mappings. | Cannot claim the OpenAI step or full workflow passed. |
| Authorized dedicated OpenAI key access plus secure Zapier UI/control access | Configure or repair the Zapier OpenAI connection, then test through Zapier. | Raw key remains outside logs, chat, screenshots, GitHub, HubSpot, and Control Room records. |
| Dedicated OpenAI key without Zapier connector, bridge, Catch Hook, or secure Zapier UI/control access | Validate OpenAI Platform target and key status only. | Cannot claim Zapier ran. Record the missing invocation path. |
| Neither connector nor authorized key path | Provide exact manual UI steps and create a blocked-evidence record. | No direct-control or end-to-end claim. |

## Canonical Day 3 path

```text
GitHub evidence
-> approved Zapier trigger or bridge
-> dedicated OpenAI connection
-> OpenAI 5W1H send gate
-> Buffer draft, queue, schedule, or approved publish action
-> HubSpot task or note associated with Founder Signal Engine
-> Founder Control Room evidence record
```

## Agent behavior

- Discover Zapier, OpenAI Developers, automation, browser-control, MCP, Catch Hook, webhook, and equivalent connectors before falling back to manual instructions.
- Agents with a native Zapier connector should use it directly.
- ChatGPT and any agent without a native Zapier connector must use the existing `@OpenAI Developers` key path together with the approved Zapier trigger or bridge.
- An agent does not need to see the raw key when Zapier already holds a working dedicated OpenAI connection.
- An agent authorized to configure the key must place it only into the secure Zapier/OpenAI connection surface.
- Prefer the dedicated `zapier-founder-signal-engine` key over a local Codex key.
- Do not create or rotate the key merely because a Zapier run is missing.
- Do not reuse, reveal, copy, log, commit, screenshot, or place the raw key in CRM or evidence content.
- Do not treat successful OpenAI authentication as proof that the GitHub trigger, Buffer mapping, HubSpot association, or full Zap passed.
- Do not treat connector availability as permission to publish, send outreach, spend funds, alter commercial terms, or widen scopes.

## 5W1H send gate

Every OpenAI action must return:

```text
Who:
What:
Where:
When:
Why:
How:
Send decision: publish-draft, review-only, internal-only, or research-task
Missing proof or missing context:
```

If any field is incomplete, the workflow must not publish or send. It should create a HubSpot task or note associated with deal `337185466050` and retain the blocked reason.

## Evidence contract

A full pass requires:

1. exact GitHub source evidence;
2. Zapier run ID and status;
3. OpenAI 5W1H output without credentials;
4. Buffer draft, queue, schedule, or publish evidence when the send decision permits it;
5. HubSpot task or note associated with deal `337185466050`;
6. Founder Control Room evidence linking the run to the source SHA;
7. no raw key in any retained artifact.

## Non-authority

This contract does not authorize blind publication, external outreach, key disclosure, credential reuse, billing changes, deployment, database migration, auth changes, deletion, or destructive provider actions.

## Rollback

Disable the Zap or bridge, disconnect or rotate the dedicated OpenAI connection only with explicit authorization, restore the prior Zap version, and mark downstream Buffer or HubSpot artifacts as invalidated. Never delete founder evidence merely to make the run look clean.
