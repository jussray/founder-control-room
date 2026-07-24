# ChatGPT → OpenAI Developers → Zapier Bridge

## Founder decision

ChatGPT does not currently have a native Zapier connector in every environment. For the Founder Signal Engine, the approved ChatGPT fallback is the existing OpenAI Developers/OpenAI Platform key path named `zapier-founder-signal-engine`, used through a preconfigured, named Zapier bridge target.

This is the operating route for ChatGPT and any approved agent that lacks a direct Zapier connector:

```text
ChatGPT or approved agent
-> @OpenAI Developers / OpenAI Platform secure key reference
-> named Founder Signal Engine bridge target
-> Zapier workflow
-> OpenAI 5W1H step
-> Buffer review/queue/publish path
-> HubSpot deal-associated evidence
-> Founder Control Room proof
```

## What “call the key” means

“Call the key” never means reading, copying, displaying, or passing the raw API key in chat. It means requesting execution through the secure provider-held key reference and the already configured bridge target.

The key name is a reference:

```text
zapier-founder-signal-engine
```

The raw value remains sealed in the provider connection.

## Agent routing rule

1. Discover whether a direct Zapier connector is available.
2. When a direct Zapier connector is available, use it for inspection, edits, tests, and run-history evidence.
3. When no direct Zapier connector is available, call the named OpenAI Developers bridge target backed by `zapier-founder-signal-engine`.
4. The bridge request must name the Zap/workflow, requested action, source PR or SHA, audit destination, and rollback/disable step.
5. If neither a direct connector nor a configured bridge target is exposed, mark the action blocked. Do not claim a Zapier run occurred.

## Required bridge envelope

```text
Bridge target: Founder Signal Engine Zapier bridge
Key reference: zapier-founder-signal-engine
Zap ID or workflow name:
Requested action: inspect, test, run_openai_step, queue_review_draft, or approved publish
Source repository:
Source PR / commit SHA:
Steering grant ID:
Audit path:
Founder approval ID, when the action publishes, sends, mutates CRM, changes credentials, or changes billing:
Rollback or disable step:
```

## Authority boundary

The OpenAI key authenticates the OpenAI side of the bridge and allows the configured Zap to call OpenAI. The named bridge target is the workflow-control path. Both are required for ChatGPT to operate Zapier without a native Zapier connector.

The key reference alone, without an exposed bridge target, is not proof that ChatGPT can inspect Zap history, edit steps, or start a Zap. Likewise, a bridge response without a Zapier run ID is not end-to-end proof.

## Day 3 proof requirements

A successful ChatGPT bridge call must return or create evidence for:

1. Zapier run ID and status;
2. OpenAI 5W1H output and send decision;
3. Buffer draft, queue, schedule, or publish artifact;
4. HubSpot task or note associated with deal `337185466050`;
5. Founder Control Room evidence tied to the exact GitHub PR and SHA;
6. no raw API key in any artifact.

## Current Day 3 source

```text
Repository: jussray/Sekret-Bip
PR: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
```

The GitHub source event is complete. The workflow does not pass until the Zapier, OpenAI, Buffer, HubSpot, and Founder Control Room evidence exists.

## Failure behavior

If the OpenAI Developers target lookup, secure bridge invocation, or Zapier run fails:

- keep the raw key sealed;
- retain the exact provider error;
- do not create duplicate keys automatically;
- do not invent a run ID or downstream artifact;
- record the blocker in Founder Control Room;
- repair the named bridge or provider connection before generating another GitHub trigger.
