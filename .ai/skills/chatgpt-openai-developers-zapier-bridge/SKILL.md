# ChatGPT OpenAI Developers Zapier Bridge

## Use this skill when

- ChatGPT must inspect, test, or operate the Founder Signal Engine Zapier workflow.
- A native Zapier connector is not available in the current ChatGPT environment.
- The existing provider-held key reference `zapier-founder-signal-engine` is already configured or expected to be configured.
- Another approved agent such as Claude may have direct Zapier access, but ChatGPT needs the OpenAI Developers fallback path.

## Canonical route

```text
ChatGPT
-> @OpenAI Developers / OpenAI Platform secure key reference
-> named Founder Signal Engine Zapier bridge target
-> Zapier
-> OpenAI 5W1H
-> Buffer
-> HubSpot
-> Founder Control Room
```

## Critical distinction

The raw API key is never a chat-visible control token. “Call the key” means invoke the provider-held key reference through the named bridge target. The bridge target supplies workflow control; the key authenticates the OpenAI side.

A key reference without a configured bridge target cannot inspect Zap history, edit Zap steps, or prove a run. A bridge response without a Zapier run ID is not proof that Zapier executed.

## Required procedure

1. Discover a native Zapier/control connector.
2. If one exists, use it within scope.
3. If none exists, discover the named OpenAI Developers bridge target.
4. Use the existing key reference `zapier-founder-signal-engine`; do not create, rotate, or duplicate a key merely because direct Zapier tooling is absent.
5. Send the complete bridge envelope.
6. Require a Zapier run ID or retain the exact provider error.
7. Capture OpenAI, Buffer, HubSpot, and Founder Control Room evidence.
8. Do not claim the end-to-end chain passed until every required artifact exists.

## Bridge envelope

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

## Allowed standing actions

- inspect the named workflow;
- inspect run history;
- test workflow structure;
- test the OpenAI step when the provider-held key reference is active;
- repair trigger scope and field mappings;
- queue review-first Buffer content;
- prepare deal-associated HubSpot evidence;
- record proof and blockers in Founder Control Room.

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

If target lookup or invocation fails, keep the raw key sealed, retain the exact error, do not create duplicate keys automatically, record the blocker, and repair the named bridge before generating another GitHub trigger.
