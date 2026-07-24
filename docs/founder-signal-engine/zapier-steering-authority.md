# Founder Signal Engine Zapier Steering Authority

## Founder intent

OpenAI Developers, ChatGPT, Codex, and other approved agents may steer the Founder Signal Engine Zap when the environment exposes a usable Zapier, automation, browser-control, MCP, or equivalent workflow-control connector.

Agents with access to the dedicated OpenAI Platform key reference may use that credential through the connected Zap to execute the OpenAI step. The raw key must never be exposed.

## The two-capability rule

Zapier steering is not a single skeleton key.

### 1. Workflow-control capability

A Zapier or equivalent control connector provides the path to:

- inspect Zap structure and run history;
- test a scoped workflow;
- repair mappings, filters, paths, and associations;
- edit a named Zap under an explicit steering grant;
- retain before/after evidence.

Without this control path, possession of an OpenAI API key does not allow an agent to inspect or edit Zapier.

### 2. OpenAI execution capability

A dedicated active OpenAI key reference allows the connected Zap to:

- run the Founder Signal Engine 5W1H analysis;
- generate review-first drafts;
- produce routing decisions;
- generate HubSpot review-task content.

The key authenticates OpenAI API calls. It is not Zapier administrator authority, publication authority, CRM authority, billing authority, or approval authority.

## Required steering envelope

Every write or execution request must name:

```text
Zap ID:
Requested action:
Steering grant ID:
OpenAI key reference available: yes/no
Audit path available: yes/no
Separate founder approval ID, when required:
Rollback or disable step:
```

Unscoped steering is forbidden.

## Standing scoped authority

For the Founder Signal Engine Day 2 workflow, an approved agent may use an available control connector to:

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

## Separate founder gates

Even with a connector, key reference, steering grant, and audit path, the following require approval for the exact action:

- publishing or sending external content;
- creating or updating HubSpot records when no approved CRM write is already in scope;
- changing credentials or API keys;
- changing billing or paid plans;
- enabling blind auto-publishing;
- changing account ownership, users, or provider connections;
- deleting Zaps, runs, drafts, records, or evidence.

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

- a key alone cannot steer Zapier;
- a connector alone can inspect a scoped workflow;
- edits and execution require a steering grant;
- OpenAI execution requires the dedicated key reference;
- all steering requires audit;
- publication, CRM mutation, credentials, and billing require separate founder approval.

## Current environment truth

At the time this contract was added, no directly invokable Zapier plugin was exposed in the active ChatGPT connector set. Agents must continue tool discovery in each environment because connector availability can change.

When no usable control connector exists, give exact Zapier UI steps and record the blocked direct-control path. Manual handoff remains the fallback, not the default.
