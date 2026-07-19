# Founder Command Bridge

Founder Command Bridge is the Control Room layer for agent-requested command execution.

It is intentionally **not** a live shell tunnel. It preserves founder direction:

1. An agent requests a command card.
2. The card names the project, mission, allowlisted command id, exact expected commit SHA, reason, rollback plan, risk, and expiry.
3. The founder approves or denies the card inside Founder Control Room.
4. An approved card returns the exact guarded-terminal payload.
5. Execution still goes through `POST /terminal/:projectSlug/run`, the terminal registry, mission policy snapshot checks, and terminal run receipts.

## Non-negotiables

- No raw Bash tunnel.
- No permanent agent session.
- No command without a mission id.
- No command without a full expected commit SHA.
- No command outside `src/terminal/registry.ts`.
- No credential-like material in reasons, rollback plans, decision notes, logs, or metadata.
- No deployment, rollback, billing, credentials, deletion, provider change, or external communication without its own separate gate.

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

## Why this exists

Founder Control Room should give agents leverage without giving away command authority. The founder keeps direction and approves the exact command. The system stores receipts.

The command bridge is a valve, not a hose.
