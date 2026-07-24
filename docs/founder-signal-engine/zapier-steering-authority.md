# Founder Signal Engine Zapier Steering Authority

## Founder intent

OpenAI Developers, ChatGPT, Codex, Claude, and other approved agents may steer the Founder Signal Engine Zap when the environment exposes a usable Zapier, automation, browser-control, MCP, Catch Hook, webhook bridge, or equivalent workflow-control path.

Claude-specific direct Zapier MCP behavior is defined in [`claude-zapier-operator.md`](./claude-zapier-operator.md).

Agents with access to the dedicated OpenAI Platform key reference may use that credential through a connected Zap to execute an OpenAI analysis step. The raw key must never be exposed.

Claude with a direct Zapier MCP may use Claude as the configured analysis worker without routing through the OpenAI Developers bridge. That does not invalidate or replace the existing OpenAI path. It is a separate provider path with the same evidence, review, and founder-approval gates.

ChatGPT-specific fallback behavior is defined in [`chatgpt-openai-developers-zapier-fallback.md`](./chatgpt-openai-developers-zapier-fallback.md).

## The two-capability rule

Zapier steering is not a single skeleton key.

### 1. Workflow-control or invocation capability

A Zapier connector, Catch Hook, webhook bridge, secure Zapier UI path, MCP action, browser-control path, or equivalent connector provides the path to:

- inspect Zap structure and run history when supported;
- invoke or test a scoped workflow;
- repair mappings, filters, paths, and associations when supported;
- edit a named Zap under an explicit steering grant when supported;
- inspect or update a saved Zapier MCP skill when supported;
- retain before/after evidence.

Without an invocation or control path, possession of an OpenAI API key or access to a language model does not prove that Zapier received or ran a request.

### 2. Analysis execution capability

The configured analysis worker may be OpenAI, Claude, or another founder-approved provider exposed by the named workflow.

An active analysis connection may:

- run the Founder Signal Engine 5W1H analysis;
- cross-reference connected source evidence;
- generate review-first drafts;
- produce routing decisions;
- generate HubSpot review-task or result-note content.

Provider authentication is not Zapier administrator authority, publication authority, CRM authority, billing authority, deletion authority, or approval authority.

When the named workflow uses OpenAI, the dedicated provider-held key reference remains required by the OpenAI bridge contract.

When Claude uses a direct Zapier MCP connection, Claude must follow the Claude operator contract and prove the actual MCP or Zap execution path. A successful Claude conversation alone does not prove an always-on event Zap exists.

## Claude direct authority

When Claude has a direct Zapier MCP or equivalent control connection, it is the preferred execution path for tasks that connection can actually perform.

Within a scoped Founder Signal Engine request, Claude may:

- inspect the named Zap and run history when exposed;
- inspect and update the existing `founder rundown` skill rather than creating a duplicate;
- cross-reference Gmail, GitHub, HubSpot, Buffer, and other connected sources;
- repair trigger scope, filters, mappings, validation, and same-deal writeback when exposed;
- test review-only actions;
- return and record exact proof.

Claude must distinguish:

```text
conversational Zapier MCP run
from
published event-triggered Zap
```

Conversational MCP proves a requested tool run. It does not prove that the workflow will wake up automatically after the conversation closes.

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
Zap ID or workflow name:
Requested action:
Steering grant ID or founder-approved scope:
Invocation path, MCP server, or bridge identifier:
Configured analysis provider:
Provider connection available: yes/no
Audit path available: yes/no
Separate founder approval ID, when required:
Rollback or disable step:
```

Unscoped steering is forbidden.

## Standing scoped authority

For the Founder Signal Engine workflow, an approved agent may use an available control or invocation path to:

- inspect the named Zap when supported;
- inspect run history when supported;
- inspect and update an existing saved Zapier skill when supported;
- repair the GitHub or HubSpot trigger scope when supported;
- invoke or test workflow structure;
- test the configured analysis worker;
- repair 5W1H field mappings when supported;
- repair validation and loop-prevention filters when supported;
- repair Buffer review-draft routing when supported;
- repair HubSpot same-deal association when supported;
- collect evidence and record the result in Founder Control Room.

This standing steering authority does not carry forward to unrelated Zaps, accounts, projects, providers, saved skills, or records.

## Evidence discipline

Every cross-source conclusion must separate:

```text
VERIFIED
INFERRED
UNKNOWN
```

A closed pull request does not prove that a workflow-failure notification is stale.

For incident investigations, use one primary classification:

```text
ACTIVE_FAILURE
HISTORICAL_FAILURE
STALE_NOTIFICATION
INFRASTRUCTURE_FAILURE
RESOLVED
UNRESOLVED
```

Follow exact identifiers such as repository, PR number, workflow, branch, SHA, run ID, job ID, and timestamps. Similar titles are not sufficient proof.

## Separate founder gates

Even with a connector, bridge, provider connection, steering grant, and audit path, the following require approval for the exact action:

- publishing or sending external content;
- creating or updating HubSpot records when no approved CRM write is already in scope;
- changing credentials or API keys;
- changing billing or paid plans;
- enabling blind auto-publishing;
- changing account ownership, users, or provider connections;
- contacting vendors, customers, partners, officials, sponsors, or investors;
- deleting Zaps, runs, saved skills, drafts, records, or evidence.

## Secret boundary

Never place a raw key in:

- GitHub files, commits, issues, pull requests, Actions logs, or artifacts;
- HubSpot tasks, notes, deals, contacts, tickets, or properties;
- Founder Control Room database rows or public status surfaces;
- Buffer drafts;
- screenshots, browser recordings, prompts, chat-visible docs, or design artifacts.

Use a provider-held connection or secret reference only.

## Runtime decision contracts

The code-owned OpenAI bridge evaluator is:

```text
src/lib/zapierSteeringAuthority.ts
```

Its tests prove the OpenAI bridge rules:

- a key alone cannot prove Zapier invocation;
- a connector or approved bridge is required for invocation or control;
- edits and execution require a steering grant;
- OpenAI execution requires the dedicated key reference;
- all steering requires audit;
- publication, CRM mutation, credentials, and billing require separate founder approval.

The Claude direct Zapier MCP path is governed by this document and [`claude-zapier-operator.md`](./claude-zapier-operator.md). It must not be represented as passing the OpenAI bridge evaluator unless the workflow actually uses that bridge.

## HubSpot closed-loop rule

For a HubSpot-triggered Claude analysis loop:

```text
FOUNDER_SIGNAL_REQUEST note
-> event Zap trigger
-> Claude structured analysis
-> required-field validation
-> FOUNDER_SIGNAL_RESULT note
-> same SIGNAL_ID
-> same HubSpot deal association
-> PUBLISH_ALLOWED: false
```

The result event must be excluded from the trigger filter to prevent recursion.

A Claude response without same-deal HubSpot writeback does not prove the closed loop.

## Buffer proof rule

When Buffer exposes creation but not reliable Find/Get reads:

- do not report an empty queue as a verified result;
- retain the item ID, status, channel, and timestamp returned by the creation action;
- write that artifact to HubSpot immediately;
- use HubSpot and Founder Control Room as the proof ledger.

## Current environment truth

At the time the original OpenAI bridge contract was updated, no directly invokable Zapier plugin was exposed in the active ChatGPT connector set. ChatGPT therefore used `@OpenAI Developers` for the secure OpenAI key/model path and required an approved Zapier Catch Hook, webhook bridge, secure UI path, MCP action, browser-control path, or equivalent invocation mechanism.

Claude may expose a direct Zapier MCP connection and should use it when available. That path can perform the Founder Signal Engine work the MCP actually exposes, including cross-app investigation, saved-skill maintenance, Zap inspection or repair, and review-only writeback.

Agents must continue tool discovery in each environment because connector availability can change.

When no usable invocation or control path exists, record the exact missing bridge identifier or setup action. Manual handoff is the fallback, not proof of completion.