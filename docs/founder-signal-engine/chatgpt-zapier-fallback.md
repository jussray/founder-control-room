# ChatGPT to Zapier Fallback Contract

## Purpose

Define the canonical way ChatGPT and any approved agent without a native Zapier connector may operate the Founder Signal Engine.

## Current founder decision

Claude may have a direct Zapier connector. ChatGPT may not. When ChatGPT lacks a native Zapier connector, it must use the existing `@OpenAI Developers` path and the dedicated `zapier-founder-signal-engine` OpenAI Platform key reference through a preconfigured, named Zapier bridge.

The raw API key is never pasted into chat, committed to GitHub, placed in HubSpot, or exposed in evidence.

## Important boundary

The API key is the credential used by the OpenAI action and the authorized bridge configuration. It is not, by itself, a Zapier administrator token.

Therefore the approved fallback is:

```text
ChatGPT or another approved agent without a native Zapier connector
-> @OpenAI Developers / OpenAI Platform key reference
-> preconfigured named Zapier bridge, webhook, action endpoint, or equivalent callable surface
-> Founder Signal Engine Zap
-> OpenAI 5W1H step
-> Buffer review queue or approved publish action
-> HubSpot deal-associated evidence
-> Founder Control Room proof
```

A request is blocked when the key reference exists but no callable Zapier bridge or equivalent control surface is configured.

## Required request envelope

Every ChatGPT fallback call must include:

```text
Zap ID: founder-signal-engine-day2
Requested action: inspect_workflow | test_workflow | edit_workflow | run_openai_step | queue_review_draft
Steering grant ID: founder-grant-day2-zapier
OpenAI key reference: zapier-founder-signal-engine
Bridge target: named endpoint or provider-held action reference
Audit correlation ID: unique run identifier
Founder approval ID: required for publish, send, CRM mutation, credentials, billing, or widened scope
Rollback: disable or revert the named Zap action
```

## Allowed behavior

With a configured bridge, steering grant, audit path, and active key reference, ChatGPT may:

- trigger a scoped test run;
- invoke the OpenAI 5W1H step;
- repair or update supported workflow inputs when the bridge exposes that action;
- queue review-first social content;
- collect Zapier, Buffer, HubSpot, and Founder Control Room evidence.

The bridge capability determines what can actually be inspected or changed. Agents must not claim access beyond the bridge's declared operations.

## Separate founder gates

The following always require approval for the exact action:

- publishing or sending external content;
- creating or updating CRM records outside an already approved write scope;
- enabling unattended auto-publishing;
- changing keys, credentials, provider connections, billing, users, or ownership;
- deleting Zaps, runs, drafts, records, or evidence.

## Day 3 proof target

For PR `jussray/Sekret-Bip#599` and merge commit `f4573d360a8fea99b301f33a2a21192525725f7b`, the workflow passes only when the evidence includes:

1. the named Zapier bridge or run ID;
2. the OpenAI 5W1H output and send decision;
3. the Buffer result;
4. the HubSpot deal-associated task or note;
5. the Founder Control Room evidence link;
6. confirmation that no raw secret entered any retained artifact.

## Failure behavior

If the bridge target is missing, rejected, or not callable, record the exact blocker. Do not create another key, invent a successful Zapier run, or treat GitHub merge evidence as proof of the external automation chain.
