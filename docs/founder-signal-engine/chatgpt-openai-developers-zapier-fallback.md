# ChatGPT OpenAI Developers to Zapier Fallback

## Purpose

Define the approved path for ChatGPT and any agent that does not have a native Zapier connector in the active environment.

The current dedicated OpenAI Platform key reference is:

```text
zapier-founder-signal-engine
```

The raw key must remain inside provider-held secret surfaces. It must never be pasted into chat, committed to GitHub, stored in HubSpot, placed in Buffer copy, added to screenshots, or written into Founder Control Room evidence.

## Canonical rule

When a native Zapier connector is available, use that connector to inspect, test, repair, and run the named Zap.

When a native Zapier connector is not available, ChatGPT must use `@OpenAI Developers` as the OpenAI credential and model path for the preconfigured Founder Signal Engine workflow, then invoke the approved Zapier trigger or bridge that already holds the workflow connection.

```text
ChatGPT request
-> @OpenAI Developers secure key/model path
-> approved Zapier trigger or bridge
-> existing Founder Signal Engine Zap
-> OpenAI 5W1H step
-> Buffer review/queue step
-> HubSpot evidence step
-> Founder Control Room proof
```

## Important boundary

The OpenAI API key authenticates the OpenAI API call used by the Zap. It does not by itself expose Zap history, edit Zap steps, create a Zapier connection, or grant Zapier administrator authority.

Therefore agents must distinguish these two capabilities:

1. **OpenAI execution path:** `@OpenAI Developers` and the existing `zapier-founder-signal-engine` key reference.
2. **Zapier invocation/control path:** a native Zapier connector, secure Zapier UI, Catch Hook, webhook bridge, MCP action, browser-control path, or equivalent authorized trigger.

A complete run requires both paths. If only the OpenAI key path exists, the agent may prepare or validate the OpenAI request but must not claim that Zapier ran.

## Agent decision order

1. Discover a native Zapier, automation, MCP, browser-control, or webhook tool.
2. If one exists, use it with the named Founder Signal Engine Zap and retain exact evidence.
3. If none exists, use `@OpenAI Developers` for the existing OpenAI key/model path and call the approved Zapier bridge or Catch Hook.
4. If no approved bridge or Catch Hook is configured, stop at a blocked state and request only the missing bridge identifier or secure setup action.
5. Never create, rotate, or replace the existing key unless Ray explicitly authorizes that exact credential change.

## Required invocation envelope

Every ChatGPT fallback invocation must provide:

```text
Source repository:
Source PR or commit:
Requested action:
Zap identifier:
Bridge or Catch Hook identifier:
OpenAI key reference: zapier-founder-signal-engine
5W1H required: yes
Publishing mode: review-first
Founder approval ID for external publication, when applicable:
Audit destination: Founder Control Room
Rollback or disable step:
```

## Day 3 proof target

For the current proof run, the source is:

```text
Repository: jussray/Sekret-Bip
PR: #599
Merge commit: f4573d360a8fea99b301f33a2a21192525725f7b
```

The run does not pass until evidence contains:

- Zapier run ID and status;
- complete OpenAI 5W1H output and send decision;
- Buffer draft, queue, schedule, or publish artifact;
- HubSpot task or note associated with Founder Signal Engine deal `337185466050`;
- Founder Control Room record linking all artifacts to the source commit;
- confirmation that no raw credential was retained.

## Publication gate

Using the key or bridge does not authorize blind publication. External posting, outreach, billing changes, credential changes, account changes, deletion, or widening the Zap scope requires the applicable founder approval.

## Failure behavior

If the bridge is missing, the Zap cannot be identified, the OpenAI step fails, or any 5W1H field is incomplete:

- do not publish;
- keep the content in review;
- record the exact blocker;
- preserve the evidence trail;
- do not create another key as a speculative fix.
