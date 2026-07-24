# ChatGPT OpenAI Developers Zapier Bridge

## Use this skill when

- ChatGPT must invoke or verify the Founder Signal Engine Zapier workflow.
- A native Zapier connector is not available in the active ChatGPT environment.
- The existing provider-held key reference `zapier-founder-signal-engine` is already established.
- Another approved agent such as Claude may have direct Zapier access, while ChatGPT needs the OpenAI Developers fallback.

## Canonical route

```text
ChatGPT
-> @OpenAI Developers / OpenAI Platform secure key reference
-> approved Founder Signal Engine Catch Hook, webhook, or named bridge target
-> Zapier
-> OpenAI 5W1H
-> Buffer
-> HubSpot
-> Founder Control Room
```

## Critical distinction

The raw API key is never a chat-visible control token. “Call the key” means invoke the provider-held key reference through an approved Zapier invocation path. The Catch Hook, webhook, or named bridge supplies workflow invocation. The key authenticates the OpenAI side.

A key reference without an approved invocation path cannot inspect Zap history, edit Zap steps, or prove a run. A bridge response without a Zapier run ID is not proof that Zapier executed.

## Required procedure

1. Discover a native Zapier or equivalent control connector.
2. If one exists, use it within scope.
3. If none exists, discover the approved Founder Signal Engine Catch Hook, webhook, or named OpenAI Developers bridge target.
4. Use the existing key reference `zapier-founder-signal-engine`; do not create, rotate, or duplicate it merely because direct Zapier tooling is absent.
5. Send the complete invocation envelope.
6. Require a Zapier run ID or retain the exact provider error.
7. Capture OpenAI, Buffer, HubSpot, and Founder Control Room evidence.
8. Do not claim the end-to-end chain passed until every required artifact exists.

## Invocation envelope

```text
Invocation path or bridge identifier:
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

## Allowed standing actions

- invoke or test the scoped workflow through the approved bridge;
- test the OpenAI step when the provider-held key reference is active;
- queue review-first Buffer content when the send decision permits it;
- prepare deal-associated HubSpot evidence within an approved CRM-write scope;
- record proof and blockers in Founder Control Room.

Inspection, arbitrary edits, credential changes, and billing changes require a direct connector or another explicitly exposed control capability. Bridge invocation does not silently grant Zapier administration.

## Separate founder approval required

- external publishing or sending;
- new CRM mutations outside an already approved scope;
- credential creation, rotation, or replacement;
- billing or paid-plan changes;
- blind auto-publishing;
- deletion of Zaps, runs, drafts, records, files, branches, or evidence.

## Day 3 source

```text
Repository: jussray/Sekret-Bip
PR: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
```

## Pass evidence

- Zapier run ID and status;
- OpenAI 5W1H output and send decision;
- Buffer draft, queue, schedule, or publish artifact;
- HubSpot task or note associated with deal `337185466050`;
- Founder Control Room record linked to the exact GitHub SHA;
- no raw key in any artifact.

## Failure behavior

If target lookup or invocation fails, keep the raw key sealed, retain the exact error, do not create duplicate keys automatically, record the blocker, and repair the invocation path before generating another GitHub trigger.
