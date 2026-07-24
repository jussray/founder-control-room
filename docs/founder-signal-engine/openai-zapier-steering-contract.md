# OpenAI Developers and Zapier Steering Contract

## Goal

Allow connected ChatGPT, Codex, and OpenAI-backed agents to inspect, repair, test, and run the Founder Signal Engine Zapier workflow through explicit, least-privilege control paths.

## Core distinction

Zapier steering has two separate planes:

1. **Credential plane:** the dedicated OpenAI Platform key lets the OpenAI step inside Zapier call an approved model.
2. **Control plane:** a Zapier, OpenAI Developers, automation, browser-control, MCP, or equivalent connector lets an acting agent inspect or operate the Zapier workflow.

A configured Zapier OpenAI connection may use the dedicated key without exposing the raw key to the acting agent. **Key possession alone is not a Zapier control surface.** A connector alone does not prove that the OpenAI action is authenticated.

## Steering authority matrix

| Available path | Allowed steering | Proof limit |
|---|---|---|
| Scoped Zapier/control connector plus an active dedicated OpenAI connection | Inspect, edit, test, and run the controlled Day 2 Zap; repair trigger scope and mappings; verify OpenAI output; create review-first Buffer and deal-associated HubSpot evidence. | Retain exact run evidence and obey the 5W1H send gate. |
| Scoped Zapier/control connector without an active OpenAI connection | Inspect and repair non-OpenAI workflow structure and mappings. | Cannot claim the OpenAI step or full workflow passed. |
| Authorized dedicated OpenAI key access plus secure Zapier UI/control access | Configure or repair the Zapier OpenAI connection, then test through Zapier. | Raw key remains outside logs, chat, screenshots, GitHub, HubSpot, and Control Room records. |
| Dedicated OpenAI key without Zapier connector or secure Zapier UI/control access | Validate OpenAI Platform target and key status only. | Cannot inspect, edit, test, or run Zapier directly. |
| Neither connector nor authorized key path | Provide exact manual UI steps and create a blocked-evidence record. | No direct-control or end-to-end claim. |

## Canonical Day 2 path

```text
GitHub evidence
-> Zapier trigger
-> dedicated OpenAI connection
-> OpenAI 5W1H send gate
-> Buffer draft or queue item only when allowed
-> HubSpot task or note associated with Founder Signal Engine
-> Founder Control Room evidence record
```

## Agent behavior

- Discover Zapier, OpenAI Developers, automation, browser-control, MCP, and equivalent connectors before falling back to manual instructions.
- Use a connector to steer Zapier only within its declared capabilities and project boundary.
- An agent does not need to see the raw key when Zapier already holds a working dedicated OpenAI connection.
- An agent authorized to configure the key must place it only into the secure Zapier/OpenAI connection surface.
- Prefer the dedicated `zapier-founder-signal-engine` key over a local Codex key.
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
4. Buffer draft or queue evidence when the send decision permits it;
5. HubSpot task or note associated with deal `337185466050`;
6. Founder Control Room evidence linking the run to the source SHA;
7. no raw key in any retained artifact.

## Non-authority

This contract does not authorize blind publication, external outreach, key disclosure, credential reuse, billing changes, deployment, database migration, auth changes, deletion, or destructive provider actions.

## Rollback

Disable the Zap, disconnect or rotate the dedicated OpenAI connection, restore the prior Zap version, and mark downstream Buffer or HubSpot artifacts as invalidated. Never delete founder evidence merely to make the run look clean.
