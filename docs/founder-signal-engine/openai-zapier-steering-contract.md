# OpenAI Developers and Zapier Steering Contract

## Goal

Allow ChatGPT, Codex, Claude, and other approved agents to operate the Founder Signal Engine through the strongest control path available without exposing credentials or pretending that one tool grants authority it does not have.

## Canonical rule

Use this order:

1. **Native Zapier connector available:** use it directly for inspection, repair, testing, and scoped execution.
2. **No native Zapier connector:** use the existing `@OpenAI Developers` key-backed execution bridge for the named Founder Signal Engine Zap.
3. **Neither path available:** stop, record the blocker, and provide exact manual Zapier steps.

Claude currently has a direct Zapier connector in the founder stack. ChatGPT does not currently have that native connector here, so ChatGPT must use the `@OpenAI Developers` bridge backed by the existing `zapier-founder-signal-engine` key reference.

The raw key is never requested, displayed, copied, logged, committed, or placed in a payload. The provider-held key reference is the connection.

## What the key-backed bridge means

The key-backed bridge allows an approved agent without native Zapier control to call a preconfigured Founder Signal Engine Zap through `@OpenAI Developers`.

It may:

- invoke the named Zap;
- test the preconfigured execution path;
- run the OpenAI 5W1H step;
- create review-first Buffer output;
- create an approved HubSpot task or note;
- return run evidence to Founder Control Room.

It may not, by itself:

- inspect arbitrary Zapier run history;
- edit Zap structure, filters, paths, mappings, app connections, or account settings;
- change credentials or billing;
- widen the Zap scope;
- publish or send without the exact founder approval required for that action.

Those administrative actions still require a native Zapier, browser-control, MCP, or equivalent control connector.

## Required bridge invocation envelope

Agents without a native Zapier connector must use this non-secret envelope:

```json
{
  "bridge": "openai-developers",
  "key_reference": "zapier-founder-signal-engine",
  "zap_id": "founder-signal-engine-day2",
  "action": "test_workflow",
  "source": {
    "repository": "jussray/Sekret-Bip",
    "pull_request": 599,
    "commit_sha": "f4573d360a8fea99b301f33a2a21192525725f7b"
  },
  "steering_grant_id": "founder-grant-day2-zapier",
  "audit_path": "founder-control-room",
  "founder_approval_id": null
}
```

Rules:

- `key_reference` names the provider-held connection only. Never substitute the raw secret.
- `zap_id` must name the approved workflow. Unscoped Zapier calls are forbidden.
- `action` must be one of the actions allowed by `src/lib/zapierSteeringAuthority.ts`.
- `steering_grant_id` is required for execution or repair actions.
- `founder_approval_id` is required for publishing, sending, CRM writes outside an already approved scope, credential changes, or billing changes.
- `audit_path` must be active before execution.

## Control-path matrix

| Available path | Allowed behavior | Not allowed |
|---|---|---|
| Native Zapier connector | Inspect, edit, test, run, and repair the named Zap within the steering grant. | Publishing, CRM mutation, credentials, billing, or scope expansion without exact approval. |
| `@OpenAI Developers` bridge plus existing key reference | Invoke and test the preconfigured Zap, run OpenAI, create review-first Buffer output, and perform approved downstream actions. | Zapier administration, arbitrary history inspection, connection edits, or account changes. |
| Existing key reference without a configured bridge target | Verify that the named key reference exists only. | Claiming Zapier was invoked or passed. |
| No connector and no bridge | Record blocked state and provide manual steps. | Any direct-control or end-to-end claim. |

## Canonical Founder Signal Engine path

```text
GitHub evidence
-> native Zapier connector OR @OpenAI Developers key-backed bridge
-> preconfigured Founder Signal Engine Zap
-> OpenAI 5W1H send gate
-> Buffer draft, queue, schedule, or approved publish action
-> HubSpot task or note associated with deal 337185466050
-> Founder Control Room evidence record
```

## Agent behavior

- Discover a native Zapier connector first.
- When native Zapier control is absent, call the approved workflow through `@OpenAI Developers` using the existing provider-held `zapier-founder-signal-engine` key reference.
- Do not create or rotate another key unless Ray explicitly requests it.
- Do not ask Ray to paste the key into chat, GitHub, HubSpot, screenshots, or evidence.
- Do not claim the bridge ran when no invocation target or run receipt is visible.
- Do not confuse successful OpenAI authentication with proof that GitHub, Buffer, HubSpot, or the whole Zap passed.
- Preserve review-first publishing until the workflow has documented trust and Ray approves graduation to scheduled automation.

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
2. native connector or OpenAI Developers bridge invocation receipt;
3. Zapier run ID and status;
4. OpenAI 5W1H output without credentials;
5. Buffer artifact and channel status when permitted;
6. HubSpot task or note associated with deal `337185466050`;
7. Founder Control Room evidence tied to the source SHA;
8. no raw key in any retained artifact.

## Non-authority

This contract does not authorize blind publication, spam, external outreach, key disclosure, billing changes, deployment, database migration, auth changes, deletion, or destructive provider actions.

## Rollback

Stop bridge invocation, disable the named Zap through an authorized control path, invalidate queued Buffer items, restore the prior Zap version when native control is available, and mark downstream HubSpot artifacts as invalidated. Never delete founder evidence merely to make the run look clean.
