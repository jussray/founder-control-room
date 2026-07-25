---
name: control-room-agent-router
version: 1.0.0
status: active
scope: founder-control-room
owner: Juss
review_cadence: quarterly
---

# Control Room Agent Router

## Trigger

Use when a task could be handled by more than one agent, connector, provider, or repository tool, or when the user asks Chief AI or Founder Control Room to coordinate work.

## Purpose

Route each task to the smallest capable agent and tool path while preserving one source of truth, one authority boundary, and one evidence trail.

## 5W1H

- **Who:** founder decision owner, executing agent, affected users, and evidence reviewer.
- **What:** exact outcome, non-goals, deliverable, and proof required.
- **Where:** authoritative repository, branch, provider, runtime, and data boundary.
- **When:** current lifecycle state, dependency order, stop condition, and escalation point.
- **Why:** verified bottleneck or founder objective.
- **How:** smallest capable agent, minimum tools, handoff contract, verification, and rollback.

## Routing hierarchy

1. Use repository truth before conversational memory.
2. Use a native connected tool before manual instructions.
3. Use the narrowest specialist skill before a general-purpose agent.
4. Keep one agent as execution owner for each atomic change.
5. Use Chief AI or ChatGPT for synthesis only after evidence exists.
6. Escalate to the founder when authority, identity, spending, publishing, production, deletion, or irreversible action is involved.

## Default lanes

- **ChatGPT:** founder-facing synthesis, planning, cross-provider coordination, and decision notes.
- **Codex:** repository implementation, debugging, focused fixes, tests, and GitHub operations.
- **Claude Code:** long-context repository analysis, careful refactors, and documentation-heavy implementation.
- **Cursor / Copilot / OpenCode / Windsurf / Bionic:** local project execution when their active workspace contains the authoritative repository and current branch.
- **Cloudflare MCP:** current docs, account inspection, bindings, builds, and observability within granted scope.
- **GitHub:** source, review, Actions evidence, branch state, and provenance.

## Routing decision record

Before material execution, record:

```text
Goal:
Authoritative source:
Execution owner:
Supporting agents/tools:
Why this route:
Authority ceiling:
Evidence required:
Stop condition:
Fallback route:
```

## Anti-patterns

- Do not ask every agent to solve the same problem independently unless deliberate variance reduction is required.
- Do not let multiple agents edit the same file or branch concurrently without an explicit merge plan.
- Do not use a general web search when a connected repository, provider, or document is the source of truth.
- Do not promote a synthesis agent into execution authority merely because it produced a confident plan.
- Do not create a new adapter, workflow, or skill when an existing one already covers the task.

## Definition of done

Routing is complete only when the execution owner, source of truth, authority ceiling, required evidence, fallback, and next founder gate are explicit.
