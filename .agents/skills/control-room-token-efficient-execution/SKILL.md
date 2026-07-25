---
name: control-room-token-efficient-execution
version: 1.0.0
status: active
scope: founder-control-room
owner: Juss
review_cadence: quarterly
---

# Control Room Token-Efficient Execution

## Trigger

Use for repository inspection, debugging, implementation, review, research, or cross-agent work where context size, repeated reading, duplicated analysis, or unnecessary tool calls could slow execution or increase cost.

## Purpose

Spend context on uncertainty and evidence, not repetition. Reduce token use without weakening reasoning, verification, safety, or founder authority.

## Core loop

```text
Goal
→ exact source of truth
→ smallest useful read
→ ranked uncertainty
→ one decisive tool call or edit
→ focused verification
→ compact evidence handoff
```

## Context budget rules

1. Read governing instructions once, then cite their file paths in the working record.
2. Search narrowly before opening large files.
3. Read only the relevant line range unless structure or full context is required.
4. Batch independent reads and checks when safe.
5. Do not ask another agent to rediscover verified facts already captured with evidence.
6. Prefer exact errors, symbols, paths, routes, workflow names, and SHAs over broad repository scans.
7. Stop expanding context when the next atomic action is clear.
8. Re-open sources after material branch or runtime changes rather than carrying stale context.

## Compression boundary

Compress narrative, not evidence.

Always preserve:

- exact repository, branch, and SHA;
- exact error text or provider result needed for diagnosis;
- authority and approval boundaries;
- changed files;
- tests and workflow conclusions;
- provider identifiers and runtime artifacts;
- rollback and next gate.

Never compress away:

- an unresolved failure;
- a security or privacy concern;
- a conflicting source of truth;
- a skipped or in-progress check;
- an assumption that changes the decision.

## Anti-waste patterns

- Do not generate multiple long plans before inspecting the source.
- Do not paste entire files into prompts when a path and line range suffice.
- Do not run broad research after repository or provider truth answers the question.
- Do not use five agents for a task one specialist can finish and verify.
- Do not repeat unchanged status summaries between tool calls.
- Do not create documentation that merely restates another authoritative contract.
- Do not optimize token use by skipping tests, evidence, red-team analysis, or rollback.

## FutureYou leverage pass

Before finishing, identify one reusable improvement that lowers future context cost, such as:

- a verifier;
- a canonical skill;
- a machine-readable routing map;
- a focused test command;
- a stable handoff packet;
- a documented source-of-truth path;
- removal of duplicate instructions.

Automate only after the simplified manual path has produced reliable evidence.

## Output

```text
GOAL:
MINIMUM SOURCES READ:
KEY UNCERTAINTY:
ATOMIC ACTION:
EVIDENCE:
CONTEXT SAVED FOR NEXT AGENT:
REUSABLE IMPROVEMENT:
NEXT GATE:
```

## Definition of done

The task reaches the correct evidence-backed decision with no material source omitted, no duplicated discovery, a compact continuation packet, and no sacrifice of verification or authority for apparent speed.
