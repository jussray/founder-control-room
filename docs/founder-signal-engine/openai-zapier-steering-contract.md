# OpenAI Developers and Zapier Steering Contract

## Goal

Allow connected ChatGPT, Codex, Claude, and other approved agents to inspect, repair, test, and run the Founder Signal Engine Zapier workflow through explicit, least-privilege control paths.

## Founder-selected operating model

Claude may have a direct Zapier connector in some environments. ChatGPT does not always have one. When ChatGPT lacks a direct Zapier connector, it must use the named `@OpenAI Developers` bridge path backed by the existing provider-held key reference:

```text
zapier-founder-signal-engine
```

Canonical fallback:

```text
ChatGPT
-> @OpenAI Developers / OpenAI Platform secure key reference
-> named Founder Signal Engine Zapier bridge target
-> Zapier workflow
```

The raw key is never displayed or copied. “Call the key” means invoke the provider-held key reference through the configured bridge target.

Read the detailed runbook: [`chatgpt-openai-developers-zapier-bridge.md`](./chatgpt-openai-developers-zapier-bridge.md).

## Core distinction

Zapier steering has three related capabilities:

1. **Credential plane:** the dedicated OpenAI Platform key lets the OpenAI step inside Zapier call an approved model.
2. **Direct control plane:** a native Zapier, browser-control, MCP, or equivalent connector lets an acting agent inspect or operate the Zapier workflow directly.
3. **ChatGPT bridge plane:** when no direct Zapier connector exists, a named OpenAI Developers bridge target provides the workflow-control route while the provider-held key reference authenticates the OpenAI side.

A configured Zapier OpenAI connection may use the dedicated key without exposing the raw key to the acting agent. **A key reference without either a direct connector or a configured bridge target is not a Zapier control surface.** A bridge response without a Zapier run ID is not end-to-end proof.

## Steering authority matrix

| Available path | Allowed steering | Proof limit |
|---|---|---|
| Scoped direct Zapier/control connector plus an active dedicated OpenAI connection | Inspect, edit, test, and run the controlled Founder Signal Engine Zap; repair trigger scope and mappings; verify OpenAI output; create review-first Buffer and deal-associated HubSpot evidence. | Retain exact run evidence and obey the 5W1H send gate. |
| Named OpenAI Developers bridge target plus the active `zapier-founder-signal-engine` key reference | ChatGPT and approved non-native agents may inspect, test, run the OpenAI step, and queue review-first output through the named bridge. | The request must name the Zap, source SHA, steering grant, audit path, and rollback. A run ID is required before claiming execution. |
| Direct control connector without an active OpenAI connection | Inspect and repair non-OpenAI workflow structure and mappings. | Cannot claim the OpenAI step or full workflow passed. |
| OpenAI Developers connector and key reference without a configured bridge target | Validate OpenAI Platform target and key-reference status only. | Cannot inspect, edit, test, or run Zapier directly. Record the missing bridge target. |
| Neither direct connector nor configured bridge target | Provide exact manual UI steps and create a blocked-evidence record. | No direct-control or end-to-end claim. |

## Canonical Founder Signal Engine path

```text
GitHub evidence
-> Zapier trigger
-> dedicated OpenAI connection
-> OpenAI 5W1H send gate
-> Buffer draft, queue, schedule, or approved publish action
-> HubSpot task or note associated with Founder Signal Engine
-> Founder Control Room evidence record
```

## Agent behavior

- Discover direct Zapier, OpenAI Developers bridge, automation, browser-control, MCP, and equivalent connectors before falling back to manual instructions.
- If a direct Zapier connector exists, use it within its declared capabilities and project boundary.
- If ChatGPT lacks a direct Zapier connector, use the named OpenAI Developers bridge target backed by `zapier-founder-signal-engine`.
- Do not start a new key-setup flow when the existing key reference is already established. Do not rotate or duplicate the key without explicit founder approval.
- An agent does not need to see the raw key when Zapier or the bridge already holds a working dedicated connection.
- An agent authorized to configure the key must place it only into the secure Zapier/OpenAI connection surface.
- Do not reuse, reveal, copy, log, commit, screenshot, or place the raw key in CRM or evidence content.
- Do not treat successful OpenAI authentication as proof that the GitHub trigger, Buffer mapping, HubSpot association, or full Zap passed.
- Do not treat connector or bridge availability as permission to publish, send outreach, spend funds, alter commercial terms, or widen scopes.

## Required ChatGPT bridge envelope

```text
Bridge target: Founder Signal Engine Zapier bridge
Key reference: zapier-founder-signal-engine
Zap ID or workflow name:
Requested action:
Source repository:
Source PR / commit SHA:
Steering grant ID:
Audit path:
Founder approval ID, when required:
Rollback or disable step:
```

If any required field is missing, ChatGPT must not claim the Zap was called.

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

## Current Day 3 source

```text
Repository: jussray/Sekret-Bip
PR: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
```

The GitHub trigger is complete. Day 3 remains blocked until the Zapier, OpenAI, Buffer, HubSpot, and Founder Control Room proof is captured.

## Non-authority

This contract does not authorize blind publication, external outreach, key disclosure, credential reuse, billing changes, deployment, database migration, auth changes, deletion, or destructive provider actions.

## Rollback

Disable the Zap or bridge target, disconnect or rotate the dedicated OpenAI connection only with explicit approval, restore the prior Zap version, and mark downstream Buffer or HubSpot artifacts as invalidated. Never delete founder evidence merely to make the run look clean.
