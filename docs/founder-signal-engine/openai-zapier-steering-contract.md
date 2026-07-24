# OpenAI Developers and Zapier Steering Contract

## Goal

Allow connected ChatGPT, Codex, Claude, and other approved agents to inspect, repair, test, and run the Founder Signal Engine Zapier workflow through explicit, least-privilege paths.

## Canonical environment rule

Different agents have different connector access:

- Claude may have a native Zapier connector.
- ChatGPT may have `@OpenAI Developers` but no native Zapier connector.
- Other agents may have neither.

Every agent must discover its available tools first. When a native Zapier connector is unavailable, the approved ChatGPT fallback is the existing OpenAI Developers bridge tied to the dedicated `zapier-founder-signal-engine` key reference and a preconfigured named Zapier target.

The raw API key is never pasted into chat or exposed to the agent. The key is used through the provider-held OpenAI Developers connection.

## Three separate capabilities

### 1. Credential capability

The dedicated OpenAI Platform key reference lets:

- the OpenAI action inside Zapier call an approved model;
- the approved OpenAI Developers bridge authenticate its OpenAI-backed invocation path.

The existing key reference is:

```text
zapier-founder-signal-engine
```

Do not create or rotate another key unless Ray explicitly requests it.

### 2. Native Zapier control capability

A native Zapier, browser-control, MCP, or equivalent connector can:

- inspect Zap structure and run history;
- edit triggers, filters, paths, and mappings;
- reconnect apps;
- test individual steps;
- inspect exact failure output.

This remains the preferred path when available.

### 3. OpenAI Developers bridge capability

When an agent has no native Zapier connector, it must call the approved bridge only when all of these are true:

1. the named Zap ID is known;
2. the bridge target is already bound to that Zapier workflow, Catch Hook, API Request, Custom Action, or equivalent secure endpoint;
3. the existing `zapier-founder-signal-engine` key reference is active;
4. a scoped steering grant exists;
5. an audit path exists;
6. the requested action is bridge-safe.

Bridge-safe actions are:

- test the named workflow;
- run the OpenAI 5W1H step;
- queue a review draft;
- perform an explicitly approved publish/send action;
- perform an explicitly approved HubSpot write.

The bridge does not grant full Zapier administration. It cannot be used to claim inspection, editing, run-history access, reconnection, billing changes, or credential changes unless a native control path separately exists.

## ChatGPT fallback procedure

```text
1. Discover native Zapier/control tools.
2. If native control exists, use it.
3. If native control does not exist, discover @OpenAI Developers.
4. Resolve the existing zapier-founder-signal-engine key reference.
5. Confirm the approved bridge is bound to the named Founder Signal Engine Zapier target.
6. Send only the scoped invocation envelope.
7. Capture the bridge response, Zapier run ID, OpenAI output, Buffer result, HubSpot result, and source SHA.
8. If the bridge target is missing or cannot return proof, record the exact blocker instead of claiming success.
```

## Required invocation envelope

```text
Zap ID:
Requested action:
Source repository:
Source PR:
Source SHA:
Steering grant ID:
OpenAI key reference available: yes/no
OpenAI Developers bridge available: yes/no
Bridge target bound: yes/no
Audit path available: yes/no
Separate founder approval ID, when required:
Rollback or disable step:
```

No raw secret value belongs in this envelope.

## Steering authority matrix

| Available path | Allowed steering | Proof limit |
|---|---|---|
| Native Zapier/control connector plus active dedicated OpenAI connection | Inspect, edit, test, and run the controlled Zap; repair trigger scope and mappings; verify OpenAI output; create Buffer and HubSpot evidence. | Retain exact run evidence and obey the 5W1H send gate. |
| Native Zapier/control connector without active OpenAI connection | Inspect and repair non-OpenAI workflow structure and mappings. | Cannot claim the OpenAI step or full workflow passed. |
| OpenAI Developers bridge plus active key reference plus bound named Zapier target | Invoke bridge-safe actions for the named workflow and collect returned evidence. | Cannot claim Zapier inspection or administration unless the bridge explicitly returns verifiable evidence for that capability. |
| OpenAI Developers connector and key reference but no bound Zapier bridge target | Validate the OpenAI side and record the missing target binding. | Cannot run the Zap or claim an end-to-end pass. |
| Dedicated OpenAI key reference without a usable native connector or bound bridge | Validate OpenAI Platform target and key status only. | Cannot inspect, edit, test, or run Zapier directly. |
| Neither native connector nor approved bridge | Provide exact manual UI steps and create a blocked-evidence record. | No direct-control or end-to-end claim. |

## Canonical Founder Signal Engine path

```text
GitHub evidence
-> native Zapier connector OR approved OpenAI Developers bridge
-> named Zapier workflow
-> existing dedicated OpenAI connection
-> OpenAI 5W1H send gate
-> Buffer draft, queue, schedule, or approved publish action
-> HubSpot task or note associated with Founder Signal Engine
-> Founder Control Room evidence record
```

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

If any field is incomplete, the workflow must not publish or send. It should create or update a HubSpot task or note associated with deal `337185466050` and retain the blocked reason.

## HubSpot rule

HubSpot is part of the evidence and follow-up layer, not proof that Zapier ran by itself.

A full pass requires the HubSpot object to contain:

- source repository;
- PR number;
- source SHA;
- Zapier run ID;
- OpenAI 5W1H result or artifact reference;
- Buffer status;
- targeted channels;
- approval state;
- blocker or result;
- Founder Control Room evidence link.

No floating task counts as complete. The task or note must be associated with the Founder Signal Engine deal `337185466050`.

## Evidence contract

A full pass requires:

1. exact GitHub source evidence;
2. Zapier run ID and status;
3. OpenAI 5W1H output without credentials;
4. Buffer draft, queue, schedule, or publish evidence when permitted;
5. HubSpot task or note associated with deal `337185466050`;
6. Founder Control Room evidence linking the run to the source SHA;
7. no raw key in any retained artifact.

## Non-authority

This contract does not authorize blind publication, unsolicited outreach, key disclosure, credential reuse, billing changes, deployment, database migration, auth changes, deletion, or destructive provider actions.

## Rollback

Disable the named Zap or bridge target, disconnect or rotate the dedicated OpenAI connection only with explicit approval, restore the prior Zap version, and mark downstream Buffer or HubSpot artifacts as invalidated. Never delete founder evidence merely to make the run look clean.
