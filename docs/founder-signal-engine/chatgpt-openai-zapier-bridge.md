# ChatGPT → OpenAI Developers → Zapier Bridge

## Founder intent

ChatGPT does not currently have a native Zapier connector in this environment. For the Founder Signal Engine, ChatGPT and any approved agent without a native Zapier connector must use the existing `@OpenAI Developers` credential path to call a preconfigured Zapier bridge.

The canonical key reference is:

```text
zapier-founder-signal-engine
```

The raw key must never be copied into chat, GitHub, HubSpot, Buffer, screenshots, logs, or Founder Control Room evidence.

## Canonical path

```text
ChatGPT or approved agent
→ @OpenAI Developers secure key reference
→ preconfigured authenticated bridge request
→ named Founder Signal Engine Zapier workflow
→ OpenAI 5W1H step
→ Buffer review/schedule/publish route
→ HubSpot deal-associated task or note
→ Founder Control Room evidence
```

## What the key does

The existing OpenAI key is the authenticated credential used by this ChatGPT fallback path and by the OpenAI action inside the configured Zapier workflow.

It does **not** expose the raw secret to the acting agent. The agent calls the approved bridge or tool surface; the provider-held connection supplies the credential.

## What must already exist

A key reference by itself is not an HTTP endpoint. The ChatGPT fallback works only when the Founder Signal Engine has a preconfigured callable bridge, such as an authenticated Zapier webhook, Zapier API action, MCP action, or equivalent provider-held control surface.

Required configuration:

```text
Bridge identifier or endpoint: provider-held, not committed
Named Zap: Founder Signal Engine
OpenAI connection: zapier-founder-signal-engine
Audit destination: Founder Control Room
Founder approval gate: required for publish/send, CRM writes outside prior scope, credential changes, billing, or destructive actions
```

## Agent decision rule

1. Discover a native Zapier connector first.
2. When a native Zapier connector exists, use it within its declared scope.
3. When no native Zapier connector exists but the approved ChatGPT bridge exists, call the bridge through `@OpenAI Developers` using the existing secure key reference.
4. When neither exists, record the blocked control path and provide the exact manual Zapier step. Do not create or rotate another key merely because the connector is absent.

## Allowed fallback actions

With the named bridge, steering grant, audit path, and required approval receipt, an approved agent may:

- trigger or test the named Founder Signal Engine Zap;
- submit verified GitHub evidence and the source SHA;
- request the OpenAI 5W1H output;
- request review-first Buffer routing;
- request HubSpot logging associated with deal `337185466050`;
- retrieve and record run identifiers and statuses.

## Separate approval gates

The bridge does not grant blanket authority. Exact founder approval remains required for:

- publishing or sending external content;
- enabling blind auto-publishing;
- changing credentials, keys, provider connections, or billing;
- CRM mutations not already explicitly approved;
- deleting Zaps, runs, drafts, CRM records, or evidence.

## Day 3 proof target

For Se’kret Bip PR #599 and merge commit `f4573d360a8fea99b301f33a2a21192525725f7b`, a full pass still requires:

1. matching Zapier run ID and status;
2. complete OpenAI 5W1H output and send decision;
3. Buffer draft, queued, scheduled, or published artifact;
4. HubSpot task or note associated with the Founder Signal Engine deal;
5. Founder Control Room evidence linking every artifact to the source SHA;
6. no raw credential in retained evidence.

## Truth boundary

Do not claim the bridge exists, ran, or passed merely because the key exists. The key is the credential path. The configured bridge is the callable path. The Zapier run is the execution proof.
