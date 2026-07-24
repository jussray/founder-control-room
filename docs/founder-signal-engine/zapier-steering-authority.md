# Founder Signal Engine Zapier Steering Authority

## Founder intent

OpenAI Developers, ChatGPT, Codex, Claude, and other approved agents may steer the Founder Signal Engine Zap when the environment exposes a usable Zapier, automation, browser-control, MCP, Catch Hook, webhook bridge, or equivalent workflow-control path.

Agents with access to the dedicated OpenAI Platform key reference may use that credential through the connected Zap to execute the OpenAI step. The raw key must never be exposed.

ChatGPT-specific fallback behavior is defined in [`chatgpt-openai-developers-zapier-fallback.md`](./chatgpt-openai-developers-zapier-fallback.md).

## The two-capability rule

Zapier steering is not a single skeleton key.

### 1. Workflow-control or invocation capability

A Zapier connector, Catch Hook, webhook bridge, secure Zapier UI path, MCP action, browser-control path, or equivalent connector provides the path to:

- inspect Zap structure and run history when supported;
- invoke or test a scoped workflow;
- repair mappings, filters, paths, and associations when supported;
- edit a named Zap under an explicit steering grant when supported;
- retain before/after evidence.

Without an invocation or control path, possession of an OpenAI API key does not prove that Zapier received or ran a request.

### 2. OpenAI execution capability

A dedicated active OpenAI key reference allows the connected Zap to:

- run the Founder Signal Engine 5W1H analysis;
- generate review-first drafts;
- produce routing decisions;
- generate HubSpot review-task content.

The key authenticates OpenAI API calls. It is not Zapier administrator authority, publication authority, CRM authority, billing authority, or approval authority.

## ChatGPT fallback authority

When ChatGPT has no native Zapier connector, the approved fallback is:

```text
ChatGPT request
-> @OpenAI Developers secure key/model path
-> existing zapier-founder-signal-engine key reference
-> approved Catch Hook or webhook bridge
-> named Founder Signal Engine Zap
```

This fallback allows ChatGPT to invoke the preconfigured workflow only through the approved bridge. It does not grant arbitrary Zap inspection or editing unless the bridge explicitly provides those capabilities.

If no approved bridge or Catch Hook is available, ChatGPT must record a blocked invocation path rather than create another key or claim the Zap ran.

## Required steering envelope

Every write, invocation, or execution request must name:

```text
Zap ID:
Requested action:
Steering grant ID:
Invocation path or bridge identifier:
OpenAI key reference available: yes/no
Audit path available: yes/no
Separate founder approval ID, when required:
Rollback or disable step:
```

Unscoped steering is forbidden.

## Standing scoped authority

For the Founder Signal Engine workflow, an approved agent may use an available control or invocation path to:

- inspect the named Zap when supported;
- inspect run history when supported;
- repair the GitHub trigger scope when supported;
- invoke or test workflow structure;
- test the OpenAI step when the dedicated key reference is active;
- repair 5W1H field mappings when supported;
- repair Buffer review-draft routing when supported;
- repair HubSpot deal association when supported;
- collect evidence and record the result in Founder Control Room.

This standing steering authority does not carry forward to unrelated Zaps, accounts, projects, or providers.

## Separate founder gates

Even with a connector, bridge, key reference, steering grant, and audit path, the following require approval for the exact action:

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

- a key alone cannot prove Zapier invocation;
- a connector or approved bridge is required for invocation or control;
- edits and execution require a steering grant;
- OpenAI execution requires the dedicated key reference;
- all steering requires audit;
- publication, CRM mutation, credentials, and billing require separate founder approval.

## Current environment truth

At the time this contract was updated, no directly invokable Zapier plugin was exposed in the active ChatGPT connector set. ChatGPT therefore uses `@OpenAI Developers` for the secure OpenAI key/model path and requires an approved Zapier Catch Hook, webhook bridge, secure UI path, MCP action, browser-control path, or equivalent invocation mechanism.

Agents must continue tool discovery in each environment because connector availability can change. Claude or another environment may expose a direct Zapier connector and should use it when available.

When no usable invocation or control path exists, record the exact missing bridge identifier or setup action. Manual handoff is the fallback, not proof of completion.
