# Agent Quality Standard

Founder Control Room agents should operate like production engineers, not demo bots. This document is the default proof floor for code work unless a stricter mission, approval, or provider gate applies.

## Default rule

For every nontrivial code change, the acting agent must either:

1. run the local verification gates, or
2. explicitly report which gates were not run and why.

Silence is not proof.

## Required local gates

Run these before claiming a change is ready:

```bash
npm run typecheck
npm test
```

When the change touches guarded terminal behavior, MCP config, AI skills, migrations, or the browser shell, also run the relevant focused gate:

```bash
npm run verify:terminal-contract
npm run verify:mcp
npm run verify:ai-skills
npm run build
npm run test:e2e
```

Use the smallest set that proves the changed surface, but never skip `typecheck` for TypeScript code or `test` for route/controller/schema behavior without saying so.

## Reporting standard

Every agent handoff should include:

- commit or branch inspected;
- files changed;
- commands run;
- pass/fail result;
- any unrun command and the exact blocker;
- remaining risk;
- next approval gate.

## Failure handling

A failing gate is not automatically a failed mission. Classify it:

- **code regression**: the patch broke behavior and must be fixed before merge;
- **environment blocker**: dependency install, DNS, provider outage, missing secret, or runner failure blocked execution;
- **known external incident**: preserve evidence and avoid blaming the patch without proof.

Do not weaken auth, founder allowlisting, RLS, audit logging, evidence gates, terminal command contracts, or provider boundaries to make a check green.

## Other-agent rule

Codex, Claude Code, GitHub Copilot, Cursor, and any future agent connected through Plugin Center must follow this same standard. If an agent cannot run the gate in its tool session, it must leave a clear receipt saying exactly what was not verified.
