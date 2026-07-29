# Open Browser Control Contract

## Purpose

Founder Control Room and connected Control Rooms may use an available browser-control surface to inspect and operate web-only systems when no direct native connector exists.

## Canonical fallback order

1. Use a direct provider connector when available.
2. Otherwise use an approved Open Browser, browser-control, computer-use, MCP, or equivalent UI-control connector.
3. Otherwise use a provider-held API bridge already configured for the workflow.
4. Otherwise give exact manual steps and record the blocked path.

## Zapier rule

For ChatGPT in environments without a native Zapier connector, use the existing `@OpenAI Developers` / OpenAI Platform connection path only as the approved bridge into the preconfigured Founder Signal Engine Zapier workflow. The dedicated key reference is `zapier-founder-signal-engine`.

The raw key must never be exposed, copied, committed, logged, placed in HubSpot, screenshots, prompts, or public evidence.

The key authenticates the OpenAI action inside Zapier. It does not by itself grant Zapier admin access. Browser control or another workflow-control surface is still required to inspect Zap structure, run history, mappings, or UI state.

## Open Browser authority

An agent may open and inspect the browser for the named workflow, test non-destructive steps, repair mappings, and capture evidence when:

- the target account and Zap are explicitly named;
- the action stays within the Founder Signal Engine scope;
- an audit trail is retained;
- no secret is revealed;
- publication, CRM writes, billing, credential changes, account changes, or deletion still pass their separate founder gate.

## Required evidence

Record the provider, target URL or object, requested action, before state, after state, run ID, screenshots where safe, rollback path, and any blocked step.

## Truth boundary

Browser access is a control surface, not proof that a workflow passed. A full pass still requires GitHub source evidence, Zapier run evidence, OpenAI 5W1H output, Buffer result, HubSpot association, and Founder Control Room evidence.
