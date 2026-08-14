---
name: control-room-skill-router
description: Automatically select the smallest evidence-bound skill stack for Juss project work from founder intent, repository truth, task risk, and runtime skill availability without fan-out or stale capability claims.
version: 1.0.0
status: active
scope: founder-control-room
owner: Juss
review_cadence: monthly
---

# Control Room Skill Router

## Trigger

Use at the start of project work when the user gives an outcome instead of naming every skill, when more than one skill could apply, or when the task crosses repository, provider, security, UI, publishing, research, or execution boundaries.

Explicit skill requests remain authoritative. The router fills in missing specialists; it does not erase the user's named skill.

## Source of truth

1. Inspect the authoritative repository, branch, PR, exact head, or provider state before routing when the task depends on live project truth.
2. Use the deterministic repository contract in `src/lib/fcrSkillRouter.ts` for project-owned selection rules.
3. Treat checked-in skill manifests as capability intent, not proof that ChatGPT, Codex, or another runtime currently has that skill installed or connected.
4. Discover runtime skill/plugin availability before invoking runtime-only specialists.

## Routing order

1. Preserve explicitly named skills.
2. Select repository truth for GitHub/code/branch/CI/audit work.
3. Select goalfix for repair, implementation, regression, or focused code change.
4. Select review-verify-merge for PR, exact-head verification, or merge intent.
5. Select proof-ladder behavior when a claim requires state → evidence → claim traceability.
6. Request the narrowest Codex Security runtime skill for security-sensitive work instead of running every security skill.
7. Require design implementation guidance plus Playwright proof for UI/runtime claims.
8. Select incident triage for outages and production failures.
9. Select proof-led publishing for public content claims.
10. Use the agent router when providers/connectors must be coordinated.
11. Fall back to Chief AI only when no narrower specialist rule matches.

## Runtime boundary

Repository routing may request a runtime specialist such as a Codex Security skill, Product Design capability, or web research. A request is not evidence that the specialist exists in the current session.

Before invocation:

- discover the currently available skill/tool/plugin;
- prefer the exact specialist over a general-purpose fallback;
- keep one execution owner for each atomic mutation;
- do not invoke duplicate overlapping specialists unless deliberate variance reduction is the goal;
- do not claim installation, connection, permission, execution, or success from repository configuration alone.

## Mutation boundary

Skill selection never grants write authority. Repository mutation, merge, deploy, publish, send, delete, spending, or production changes still require the relevant authority, evidence, review, and rollback gates.

For code changes:

- inspect before mutation;
- use the smallest reversible patch;
- verify the narrowest useful test first;
- require exact-head checks before merge;
- require Playwright evidence for UI/runtime claims;
- stop when the requested outcome is proven or the next gate requires founder authority.

## Output contract

Return or preserve these fields when routing materially affects execution:

```text
Goal:
Intents:
Selected repo-owned skills:
Runtime skill requests:
Required tools:
Required proof:
Unavailable/unresolved skills:
Execution owner:
Authority ceiling:
Stop condition:
Next gate:
```

## Definition of done

Routing is complete only when the smallest relevant skill stack is selected, missing runtime capabilities are explicitly unresolved rather than assumed, required proof is named, and the next execution gate is clear.
