---
name: control-room-skill-router
description: Validate Chief AI skill and capability routes against founder intent, exact project truth, repository policy, authority, proof, and runtime availability without reconstructing capability selection inside Founder Control Room.
version: 1.0.0
status: active
scope: founder-control-room
owner: Juss
review_cadence: monthly
---

# Control Room Skill Router

## Trigger

Use at the start of project work when the user gives an outcome instead of naming every skill, when more than one capability could apply, or when work crosses repository, provider, security, UI, commercial, messaging, publishing, research, or execution boundaries.

## Constitutional split

Chief AI Machine owns reasoning, capability composition, and skill/tool routing.
Founder Control Room owns project truth, governance, validation, approvals, evidence, and outcome receipts.

Founder Control Room MUST NOT reconstruct specialist selection from prompt keywords, stage names, provider names, or model guesses. Chief AI must first produce a hash-bound `juss-v10/capability-plan@v1` contract. The router validates that plan; it does not replace it.

## Source of truth

1. Inspect the authoritative goal, project, exact Git head, capability-registry hash, repository/provider state, and relevant local policy.
2. Require a Chief AI capability plan selected by `chief-ai-machine` and validate its shape, plan hash, goal, project, exact head, registry hash, provenance, and authority ceiling.
3. Preserve explicit skill requests as policy requirements. `/sales /devil` remain mandatory for commercial work.
4. Messaging, outreach, email, SMS, calls, social DMs, and unified-inbox work require the `unified-growth-inbox` capability and preserve `draft_only` as the default mode.
5. Resolve repository work through the authoritative `RepositoryProvider`; never hard-code GitHub merely because one current provider is GitHub.
6. Treat checked-in manifests and capability plans as routing intent, not proof that ChatGPT, Codex, Product Design, or another runtime currently has a capability installed, connected, permitted, or executable.
7. Discover runtime skill/plugin/tool availability only after the Chief AI plan and repository policy gates pass.

## Routing gate

The router may:

- validate Chief AI's planned capability IDs;
- require explicitly named or repository-mandated capabilities to be present in that plan;
- reject stale head, wrong project, wrong goal, wrong registry, malformed hash, missing policy capability, or missing provider context;
- add evidence and authority requirements imposed by repository policy;
- require Playwright evidence for UI/runtime claims;
- classify typed mutation actions including merge, deploy, migrate, rollback, publish, send, and delete;
- return the validated bounded plan to runtime discovery.

The router may NOT:

- invent a fallback skill stack;
- add a specialist because a keyword merely sounds related;
- silently replace a missing Chief AI plan;
- promote provider/community/vendor capability authority;
- infer repository provider identity from the prompt;
- grant mutation or execution authority.

## Runtime boundary

After validation:

- discover the currently available capability, skill, tool, or plugin for only the IDs already present in the validated Chief AI plan;
- preserve one execution owner for each atomic mutation;
- do not invoke duplicate overlapping specialists unless Chief AI deliberately encoded variance reduction in the plan;
- do not claim installation, connection, permission, invocation, execution, or success from repository configuration or a capability plan alone.

## Mutation boundary

Skill routing never grants write authority. Repository mutation, merge, deployment, migration, rollback, publication, messaging send, deletion, spending, commercial changes, or production changes still require the relevant action-specific authority, evidence, approval, execution receipt, and rollback contract.

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
Action:
Chief AI plan hash:
Planned capability IDs:
Repository-required capability IDs:
Missing policy capabilities:
Repository provider:
Required tools:
Required proof:
Mutation requested:
Runtime discovery required:
Execution allowed:
Errors:
Next gate:
```

## Definition of done

Routing is complete only when a hash-bound Chief AI capability plan matches the current goal, project, exact head, and authoritative registry; repository-mandated capabilities are present; provider and mutation authority are explicit; required proof is named; runtime availability remains unresolved until discovered; and Founder Control Room has not reconstructed capability selection itself.
