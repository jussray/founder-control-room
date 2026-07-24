# Founder Signal Engine Zapier Steering Authority

## Founder intent

Approved agents may operate the Founder Signal Engine through the strongest path available in their environment.

- Claude or another agent with a native Zapier connector should use that connector directly.
- ChatGPT or another approved agent without a native Zapier connector must use the existing `@OpenAI Developers` key-backed execution bridge for the named Founder Signal Engine Zap.
- If neither path is available, the agent must record the blocked state and provide exact manual steps.

The existing provider-held key reference is:

```text
zapier-founder-signal-engine
```

The raw key must never be exposed.

## Three-path rule

### 1. Native Zapier control

A native Zapier, browser-control, MCP, or equivalent workflow connector can:

- inspect Zap structure and run history;
- repair mappings, filters, paths, and associations;
- test and run the named workflow;
- manage app connections when separately approved;
- retain before-and-after evidence.

### 2. OpenAI Developers key-backed bridge

When native Zapier control is absent, an approved agent may invoke the preconfigured Founder Signal Engine Zap through `@OpenAI Developers` using the existing provider-held key reference.

This path can:

- invoke the named Zap;
- test the preconfigured execution path;
- run the OpenAI 5W1H action;
- create review-first Buffer output;
- create approved HubSpot evidence;
- return a run receipt to Founder Control Room.

This path cannot, by itself:

- inspect arbitrary Zapier history;
- edit Zap structure, filters, mappings, or account settings;
- change credentials or billing;
- widen workflow scope;
- publish or send without exact founder approval.

### 3. Manual fallback

When neither native Zapier control nor the configured OpenAI Developers bridge is available, the agent must:

1. record the missing path;
2. avoid claiming the workflow ran;
3. provide exact Zapier UI steps;
4. preserve the next evidence gate.

## Required steering envelope

Every write or execution request must name:

```text
Zap ID:
Requested action:
Control path: native_zapier_connector or openai_developers_bridge
OpenAI key reference available: yes/no
Steering grant ID:
Audit path available: yes/no
Separate founder approval ID, when required:
Source repository, PR, and SHA:
Rollback or disable step:
```

Unscoped steering is forbidden.

## Standing scoped authority

For the Founder Signal Engine workflow, an approved agent may use an available execution path to:

- test the named workflow;
- run the OpenAI 5W1H step when the dedicated key reference is active;
- generate review-first social drafts;
- route approved content to Buffer;
- create approved HubSpot tasks or notes associated with deal `337185466050`;
- collect exact evidence and record it in Founder Control Room.

Native Zapier control is still required to inspect or repair Zap structure, connections, filters, and mappings.

This standing authority does not carry forward to unrelated Zaps, accounts, projects, or providers.

## Separate founder gates

Even with a connector, key reference, steering grant, and audit path, the following require approval for the exact action:

- publishing or sending external content;
- creating or updating HubSpot records outside an already approved CRM write scope;
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

Use the provider-held `zapier-founder-signal-engine` key reference only.

## Runtime decision contract

The code-owned evaluator is:

```text
src/lib/zapierSteeringAuthority.ts
```

Its tests prove:

- native Zapier control remains the administrative path;
- ChatGPT may invoke the preconfigured workflow through the OpenAI Developers bridge when the existing key reference, named Zap, steering grant, and audit path are present;
- a key reference without a configured bridge target cannot claim Zapier execution;
- the bridge cannot inspect or edit Zapier administration surfaces;
- publication, CRM mutation, credentials, and billing require separate founder approval.

## Current environment truth

ChatGPT does not currently expose a native Zapier connector in this environment. Therefore ChatGPT must attempt the `@OpenAI Developers` key-backed bridge before falling back to manual instructions.

The bridge is considered usable only when an invocation target and run receipt are available. If the target cannot be resolved or the run receipt is absent, record the path as blocked instead of claiming success.
