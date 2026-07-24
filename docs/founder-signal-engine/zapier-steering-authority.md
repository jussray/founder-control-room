# Founder Signal Engine Zapier Steering Authority

## Founder intent

OpenAI Developers, ChatGPT, Codex, Claude, and other approved agents may steer the Founder Signal Engine Zap through the strongest available scoped path.

- Agents with a native Zapier connector should use it.
- ChatGPT or another agent without a native Zapier connector must use the approved OpenAI Developers bridge when it is bound to the named Zapier target.
- The existing dedicated key reference is `zapier-founder-signal-engine`.
- The raw key must never be exposed.

Do not create a replacement key merely because an agent cannot see the raw value. Provider-held key access is the intended security boundary.

## The three-capability rule

Zapier steering is not a single skeleton key.

### 1. Native workflow-control capability

A Zapier or equivalent control connector provides the path to:

- inspect Zap structure and run history;
- test a scoped workflow;
- repair mappings, filters, paths, and associations;
- edit a named Zap under an explicit steering grant;
- reconnect apps when separately authorized;
- retain before/after evidence.

This is the preferred path whenever the acting environment exposes it.

### 2. OpenAI execution capability

A dedicated active OpenAI key reference allows:

- the connected Zap to run Founder Signal Engine 5W1H analysis;
- the approved OpenAI Developers bridge to authenticate its OpenAI-backed invocation path;
- review-first draft generation;
- routing decisions;
- HubSpot review-task content generation.

The key authenticates OpenAI API calls. It is not a Zapier administrator token, publication authority, CRM authority, billing authority, or approval authority.

### 3. OpenAI Developers bridge capability

When no native Zapier connector exists, an agent may invoke the named workflow through the OpenAI Developers bridge only when:

- the bridge is available in the acting environment;
- the bridge target is already bound to the named Founder Signal Engine Zapier workflow, Catch Hook, API Request, Custom Action, or equivalent secure target;
- the existing dedicated OpenAI key reference is active;
- the request includes a named Zap ID, steering grant, audit path, source evidence, and rollback step.

The bridge may invoke approved workflow actions and return evidence. It does not grant general Zapier inspection or administration.

## Required steering envelope

Every write or execution request must name:

```text
Zap ID:
Requested action:
Source repository:
Source PR:
Source SHA:
Steering grant ID:
Native Zapier control connected: yes/no
OpenAI Developers bridge available: yes/no
Bridge target bound: yes/no
OpenAI key reference available: yes/no
Audit path available: yes/no
Separate founder approval ID, when required:
Rollback or disable step:
```

Unscoped steering is forbidden. No raw secret value may appear in the envelope.

## Standing scoped authority

For the Founder Signal Engine workflow, an approved agent may use an available native control connector to:

- inspect the named Zap;
- inspect run history;
- repair the GitHub trigger scope;
- test workflow structure;
- test the OpenAI step when the dedicated key reference is active;
- repair 5W1H field mappings;
- repair Buffer review, scheduling, or approved-publish routing;
- repair HubSpot deal association;
- collect evidence and record the result in Founder Control Room.

When no native connector exists, the same agent may use the approved OpenAI Developers bridge to:

- invoke a controlled workflow test;
- run the OpenAI 5W1H step;
- queue a review draft;
- perform an exact approved publish/send action;
- perform an exact approved HubSpot write;
- return the run ID and downstream evidence.

This standing authority does not carry forward to unrelated Zaps, accounts, projects, providers, or bridge targets.

## ChatGPT-specific fallback

ChatGPT currently uses `@OpenAI Developers` as its OpenAI-side connector. When ChatGPT has no native Zapier connector, it must:

```text
@OpenAI Developers
-> resolve the existing zapier-founder-signal-engine key reference
-> invoke the approved bridge bound to the named Founder Signal Engine Zapier target
-> receive and verify the Zapier run result
-> continue through OpenAI 5W1H, Buffer, HubSpot, and Founder Control Room evidence
```

If the OpenAI Developers connector cannot resolve the target or the bridge is not bound, ChatGPT must record that exact blocker. It must not repeatedly start new key-creation flows, ask Ray to paste a key into chat, or claim that key existence alone ran Zapier.

## Separate founder gates

Even with a connector, bridge, key reference, steering grant, and audit path, the following require approval for the exact action:

- publishing or sending external content;
- creating or updating HubSpot records when no approved CRM write is already in scope;
- changing credentials or API keys;
- changing billing or paid plans;
- enabling blind auto-publishing;
- changing account ownership, users, or provider connections;
- deleting Zaps, runs, drafts, records, or evidence.

## HubSpot evidence requirement

A Founder Signal Engine HubSpot task or note must be associated with deal `337185466050` and include:

- source repository, PR, and SHA;
- Zapier run ID;
- OpenAI 5W1H result or artifact reference;
- Buffer status and targeted channels;
- approval state;
- blocker or outcome;
- Founder Control Room evidence link.

A floating HubSpot task or a manually created note without a matching Zapier run does not prove the automation passed.

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

- a raw or referenced key without a native connector or bound bridge cannot steer Zapier;
- a native connector can inspect a scoped workflow;
- ChatGPT can invoke bridge-safe actions through a bound OpenAI Developers bridge;
- the bridge cannot inspect or administer Zapier;
- edits and execution require a steering grant;
- OpenAI execution requires the existing dedicated key reference;
- all steering requires audit;
- publication, CRM mutation, credentials, and billing require separate founder approval.

## Current environment truth

At the time of this update, the active ChatGPT environment exposes OpenAI Developers but no directly invokable native Zapier plugin. The approved fallback is therefore the OpenAI Developers bridge, but only after a named Zapier target binding is verifiably present.

If the target binding is absent, the next technical task is to create or expose that secure bridge target. Manual Zapier UI handoff remains the fallback for inspection, editing, and run-history access.

## Rollback

Disable the named bridge target or Zap, restore the prior Zap version, and mark affected Buffer or HubSpot artifacts as invalidated. Rotate or replace the existing key only with explicit founder approval. Never delete founder evidence merely to make the run look clean.
