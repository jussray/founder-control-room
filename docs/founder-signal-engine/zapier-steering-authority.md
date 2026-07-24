# Founder Signal Engine Zapier Steering Authority

## Founder intent

OpenAI Developers, ChatGPT, Codex, Claude, and other approved agents may steer the Founder Signal Engine Zap when the environment exposes either:

1. a usable direct Zapier, automation, browser-control, MCP, or equivalent workflow-control connector; or
2. the named OpenAI Developers bridge target backed by the existing `zapier-founder-signal-engine` provider-held key reference.

Claude may use a direct Zapier connector where available. ChatGPT must use the OpenAI Developers bridge route when a native Zapier connector is absent.

The raw key must never be exposed.

## The three-capability rule

Zapier steering is not a single skeleton key.

### 1. Direct workflow-control capability

A direct Zapier or equivalent control connector provides the path to:

- inspect Zap structure and run history;
- test a scoped workflow;
- repair mappings, filters, paths, and associations;
- edit a named Zap under an explicit steering grant;
- retain before/after evidence.

### 2. ChatGPT OpenAI Developers bridge capability

When ChatGPT has no native Zapier connector, it must invoke the named Founder Signal Engine bridge target through `@OpenAI Developers` / OpenAI Platform.

Approved route:

```text
ChatGPT
-> OpenAI Developers secure target
-> provider-held key reference: zapier-founder-signal-engine
-> named Founder Signal Engine Zapier bridge
-> Zapier
```

“Call the key” means call the secure key reference through the named bridge target. It never means reading, copying, or pasting the raw secret.

A bridge invocation must return a Zapier run ID or a specific provider error. Without that evidence, the agent must not claim that Zapier ran.

### 3. OpenAI execution capability

A dedicated active OpenAI key reference allows the connected Zap or bridge to:

- run the Founder Signal Engine 5W1H analysis;
- generate review-first drafts;
- produce routing decisions;
- generate HubSpot review-task content.

The key authenticates OpenAI API calls and the approved bridge route. It is not publication authority, CRM authority, billing authority, or approval authority.

## Required steering envelope

Every write or execution request must name:

```text
Control path: direct_zapier_connector or openai_developers_bridge
Bridge target, when used:
Key reference, when used: zapier-founder-signal-engine
Zap ID:
Requested action:
Source repository:
Source PR / commit SHA:
Steering grant ID:
Audit path available: yes/no
Separate founder approval ID, when required:
Rollback or disable step:
```

Unscoped steering is forbidden.

## Standing scoped authority

For the Founder Signal Engine workflow, an approved agent may use an available direct connector or configured OpenAI Developers bridge to:

- inspect the named Zap;
- inspect run history;
- repair the GitHub trigger scope;
- test workflow structure;
- test the OpenAI step when the dedicated key reference is active;
- repair 5W1H field mappings;
- repair Buffer review-draft routing;
- repair HubSpot deal association;
- collect evidence and record the result in Founder Control Room.

This standing steering authority does not carry forward to unrelated Zaps, accounts, projects, or providers.

## ChatGPT routing requirement

ChatGPT must follow this order:

1. discover a direct Zapier/control connector;
2. if absent, discover the named OpenAI Developers bridge target;
3. use the existing `zapier-founder-signal-engine` key reference through that bridge;
4. never create, rotate, or duplicate the key merely because direct Zapier tooling is absent;
5. if the target is missing or the provider rejects the call, record the exact blocker and stop claiming execution.

Detailed bridge runbook: [`chatgpt-openai-developers-zapier-bridge.md`](./chatgpt-openai-developers-zapier-bridge.md).

## Separate founder gates

Even with a connector, bridge target, key reference, steering grant, and audit path, the following require approval for the exact action:

- publishing or sending external content;
- creating or updating HubSpot records when no approved CRM write is already in scope;
- changing credentials or API keys;
- changing billing or paid plans;
- enabling blind auto-publishing;
- changing account ownership, users, or provider connections;
- deleting Zaps, runs, drafts, records, branches, files, or evidence.

## Secret boundary

Never place a raw key in:

- GitHub files, commits, issues, pull requests, Actions logs, or artifacts;
- HubSpot tasks, notes, deals, contacts, tickets, or properties;
- Founder Control Room database rows or public status surfaces;
- Buffer drafts;
- screenshots, browser recordings, prompts, chat-visible docs, or design artifacts.

Use a provider-held connection or secret reference only.

## Runtime decision contract

The code-owned evaluator is:

```text
src/lib/zapierSteeringAuthority.ts
```

Its tests prove:

- a raw key or key reference alone cannot steer Zapier;
- a direct connector can inspect a scoped workflow;
- ChatGPT can use a configured OpenAI Developers bridge target when direct Zapier control is absent;
- the bridge path requires the provider-held `zapier-founder-signal-engine` key reference;
- edits and execution require a steering grant;
- all steering requires audit;
- publication, CRM mutation, credentials, and billing require separate founder approval.

## Current environment truth

At the time of this update, no directly invokable native Zapier plugin was exposed in the active ChatGPT connector set. The OpenAI Developers/OpenAI Platform connector was available for secure key-reference operations, but direct target lookup returned a provider rejection. That means the ChatGPT bridge contract is now defined, while the live bridge target still needs to be exposed or repaired before ChatGPT can prove a Zapier run.

Current Day 3 source:

```text
Repository: jussray/Sekret-Bip
PR: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
```

When no direct connector or usable bridge target exists, record the blocked direct-control path. Manual handoff remains the last fallback, not proof of execution.
