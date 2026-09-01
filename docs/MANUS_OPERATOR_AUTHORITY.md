# Manus Operator Authority

Last reviewed: 2026-08-29

## Founder decision

Manus is an approved Founder Control Room conversational decision surface alongside `fcr`, `chatgpt`, `claude`, and `perplexity`.

This registration lets a trusted Manus adapter carry an explicit founder decision into the existing Founder Control Decision / Ask-Founder authority membrane. It does not make Manus output, a linked messenger account, or a plain copied message self-authorizing.

Slack and Telegram are transports for Manus. They are not separate founder-control surfaces and they do not acquire authority merely by being connected.

## Operator read scope

The served remote MCP read boundary may inspect the complete active FCR portfolio:

- `sekret-bip`
- `juss-beautiful-hair`
- `jbh-private`
- `l99`
- `chief-ai-machine`
- `untold-stories`
- `founder-control-room`
- `promptos`

This list must match the authority-bearing `PORTFOLIO_PROJECTS` registry. External continuity-only projects and quarantined repositories remain outside the grant.

The remote MCP token and OAuth project claims are read/preview authority only. They do not authorize repository mutation, merge, deployment, database changes, provider changes, publication, billing, deletion, credentials, or arbitrary command execution.

## Mutation path

A non-read action must continue through the existing exact-scope authority chain:

```text
proposal + exact target/state fingerprint
→ founder permission request
→ explicit authenticated founder decision
→ exact proposal/decision hash validation
→ separately gated execution binding
→ action receipt + evidence
```

The approved decision surface may be `manus`, but the decision remains bound to the exact proposal identity. A changed project, action, payload hash, branch, commit SHA, capability plan, or evidence state requires a new decision.

## Fingerprints and continuity

Operator fingerprints and proof cookies are deterministic audit continuity only:

```text
browserCookie = false
actionAuthority = false
messengerTransportAuthority = false
```

They may bind the active project scope, exact repository/branch/head, decision surface, evidence state, and next gate. They never authenticate a browser, impersonate the founder, or grant execution authority.

## Fail-closed rule

If adapter identity, founder identity, project scope, proposal hash, exact head, receipt persistence, or required evidence cannot be verified, the requested action remains blocked. Read access must also fail closed when its dedicated token/OAuth grant or server-held project scope is missing or inconsistent.
