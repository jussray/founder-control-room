# Founder Command Bridge

Founder Command Bridge is the safe agent-to-terminal handshake for Founder Control Room.

It is **not** a tunnel. It is not a shell. It is not standing permission for an agent to run commands.

## Principle

Ray keeps direction and command authority. Agents may request proof, but Founder Control Room decides whether that power is granted.

```text
agent proposes → command card → founder approves/denies → guarded terminal payload → terminal run receipt
```

## What a command card contains

Every command card is tied to:

- project slug;
- mission id;
- allowlisted terminal command id;
- exact 40-character expected commit SHA;
- requesting agent;
- reason;
- rollback plan;
- risk level from `src/terminal/registry.ts`;
- expiry, up to 24 hours;
- founder decision state;
- optional terminal run receipt.

## Non-negotiables

Command Bridge must never become:

- a raw Bash tunnel;
- a permanent remote agent session;
- an alternate command registry;
- a route around mission state, expected-head checks, or proof gates;
- a way to deploy, spend, change credentials, delete data, send external communications, or mutate providers without the separate founder gate.

## Execution model

Approval returns a terminal payload for the existing guarded terminal route:

```text
POST /terminal/:projectSlug/run
```

The terminal route still validates:

- founder session and allowlist;
- guarded terminal boundary;
- project verification enabled;
- mission belongs to project;
- mission policy snapshot expected head;
- allowed mission status for command risk;
- command is present in `src/terminal/registry.ts`;
- one active run per project;
- bounded output and timeout.

## Default command proof floor

For Founder Control Room code changes, other agents should request these cards first:

```text
verify.typecheck
verify.unit
```

When the touched surface requires it, add the focused command:

```text
verify.build
verify.lint
verify.terminal-contract
verify.mcp
verify.ai-skills
```

## Product design intent

The UI should feel like an operator cockpit, not a chat log. A founder should see each command as a card with:

- what will run;
- why it was requested;
- what evidence it should produce;
- what could go wrong;
- what rollback means;
- whether it expires soon;
- approve / deny controls.

## Audit trail

The API writes project events for request creation, approval, denial, payload issuance, and execution marking. If audit logging fails, the bridge should refuse to pretend the action completed.

## Agent rule

Agents may suggest commands. They do not own execution. If an agent cannot run a proof gate in its own tool session, it should create or request a Command Bridge card rather than claim unverified readiness.

The command bridge is a valve, not a hose.
