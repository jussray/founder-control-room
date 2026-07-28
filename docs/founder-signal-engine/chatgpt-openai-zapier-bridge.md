# ChatGPT → OpenAI Developers → Zapier Bridge

## Purpose

Document the operating path for ChatGPT and any approved agent that does not have a native Zapier connector in its current environment.

## Canonical connection

```text
ChatGPT or another approved agent
→ @OpenAI Developers / OpenAI Platform secure key path
→ existing key reference: zapier-founder-signal-engine
→ preconfigured Founder Signal Engine Zapier connection or bridge
→ named Zapier workflow
→ OpenAI 5W1H step
→ review-first Buffer routing
→ HubSpot evidence
→ Founder Control Room proof
```

The existing key reference is the approved OpenAI-side credential for this workflow. Do not create a replacement key merely because an agent lacks a native Zapier connector.

## What “call Zapier through the key” means

For ChatGPT, the practical fallback is to invoke the already-authorized OpenAI Developers path that has been wired to the Founder Signal Engine Zapier workflow or its secure bridge endpoint. The raw key remains sealed and provider-held.

The key authenticates the OpenAI-side bridge or the OpenAI action inside Zapier. It is not a universal Zapier administrator token. A full run still requires a real, preconfigured Zapier connection, webhook, action, API route, or equivalent control bridge.

## Agent routing rules

1. Discover a direct Zapier, automation, browser-control, MCP, or equivalent connector first.
2. When a direct Zapier connector exists, use it within the named workflow and audit boundaries.
3. When no direct Zapier connector exists, use `@OpenAI Developers` and the existing `zapier-founder-signal-engine` key path to call the preconfigured Zapier bridge.
4. Never ask for, reveal, log, copy, rotate, or recreate the raw key unless the founder explicitly authorizes a credential change.
5. Never claim Zapier ran merely because the OpenAI key exists or an OpenAI request succeeded. Retain the Zapier run ID and downstream evidence.
6. Claude or another agent with a direct Zapier connector may use that connector instead of the fallback bridge, while preserving the same proof and approval gates.

## Required invocation envelope

```text
Workflow: Founder Signal Engine
Source repository:
Source PR or commit:
Requested action: inspect | test | generate-review-draft | queue-approved-content
OpenAI key reference: zapier-founder-signal-engine
Approval receipt, when external publication or CRM mutation is requested:
Evidence destination: Founder Control Room
Rollback or disable step:
```

## Day 3 proof contract

A successful call must retain:

- exact GitHub source SHA or PR;
- Zapier run ID and result;
- OpenAI 5W1H output and send decision;
- Buffer draft, queue, schedule, or publish status;
- HubSpot task or note associated with the Founder Signal Engine deal;
- Founder Control Room evidence link;
- no raw credentials in any artifact.

## Safety boundary

This contract does not authorize blind publishing, outreach, billing changes, credential changes, destructive Zap edits, deletion of evidence, or unrelated workflow access. Publication and CRM writes require the applicable founder approval gate.

## Failure behavior

When the OpenAI Developers key target or the Zapier bridge cannot be resolved, stop and record the missing connection. Do not create another key automatically, fabricate a run, or treat documentation as runtime proof.
