---
name: control-room-agent-handoff
description: Use when work moves between agents, tools, humans, repositories, or providers to transfer exact state, evidence, boundaries, rollback, and one next action without transferring broader authority.
version: 1.1.0
status: active
scope: founder-control-room
owner: Juss
review_cadence: quarterly
---

# Control Room Agent Handoff

## Trigger

Use whenever work moves between ChatGPT, Chief AI, Codex, Claude Code, Cursor, Copilot, OpenCode, Windsurf, Bionic, a human operator, or a provider-specific agent.

## Purpose

Transfer verified state without forcing the next agent to reread the universe, repeat failed work, inherit hidden assumptions, or exceed the original authority.

## Handoff packet

Every material handoff must contain:

```text
GOAL:
AUTHORITATIVE REPOSITORY:
BRANCH:
EXACT HEAD SHA:
BASE / MAIN SHA:
ENVIRONMENT:
EXECUTION OWNER:
COMPLETED:
VERIFIED EVIDENCE:
FAILED OR BLOCKED:
BLOCKER FINGERPRINT:
RETRY TRIGGER:
FILES TO READ FIRST:
FILES CHANGED:
DO NOT TOUCH:
AUTHORITY CEILING:
ROLLBACK:
ONE NEXT ACTION:
STOP CONDITION:
```

## Evidence rules

- Link or name exact commits, PRs, workflow runs, jobs, artifacts, deployments, routes, records, and screenshots.
- Separate verified, inferred, unknown, and blocked facts.
- Preserve exact provider errors rather than translating them into a guessed diagnosis.
- Include only the minimum context required to continue safely.
- Never include raw credentials, private user payloads, or hidden chain-of-thought.
- A reported configuration, credential, DNS, ruleset, or provider change is not transferred as `VERIFIED` until the intended consuming workflow/runtime/provider read-back observes it.
- If the authoritative base or runtime moved after the packet was created, discard inherited readiness and reacquire the new authority before editing, retrying, reviewing, or merging.

## Retry-safe handoff

A handoff must prevent the receiving agent from replaying an unchanged failure loop.

The `BLOCKER FINGERPRINT` should identify the exact head/base, blocking consumer or gate, terminal classification, and relevant dependency/provider receipt. The `RETRY TRIGGER` must name the smallest observable change that would make another attempt informative.

Examples of valid retry triggers:

- exact PR or `main` SHA changed;
- the exact consuming workflow proves a previously missing secret is now present and header-safe;
- provider read-back changes from policy drift to target policy;
- a queued/running check reaches a new terminal conclusion;
- canonical runtime routing changes and `/version` is re-observed.

If none of those changes occurred, the receiving agent should **not** rerun, create an empty commit, reread the same status, or ask the founder to repeat an already-completed action.

## Authority inheritance

A handoff transfers context, not authority.

- The receiving agent may act only within the original task's confirmed scope.
- Merge, deployment, rollback, DNS, credentials, billing, publication, external communication, deletion, and sensitive-data access remain separately gated.
- A previous agent's recommendation is not founder approval.
- A successful read does not authorize a write.

## Red-team checks

Before handoff, ask:

- Could the next agent mistake configuration proof for runtime proof?
- Could stale branch or SHA information cause edits on the wrong target?
- Is an unresolved failure being hidden behind a summary?
- Did the packet preserve unrelated work and explicit non-goals?
- Could the handoff expose secrets, private data, or proprietary logic?
- Is the next action atomic enough to verify?
- Does the packet prove a claimed dependency change at its consumer, or merely repeat that someone changed a setting?
- Would the next action reproduce the same blocker fingerprint with no plausible new evidence?

## Lindy and FutureYou screen

A durable handoff should be readable by another capable agent months later, survive provider replacement, preserve repository-native evidence, and make redundant retries difficult. Prefer commit SHAs, files, tests, provider identifiers, blocker fingerprints, and explicit retry triggers over chat-specific narrative.

## Definition of done

The next agent can begin with one atomic action, knows where truth lives, knows what is proven, knows what remains blocked, knows exactly what must change before a retry is useful, and cannot reasonably mistake the handoff for broader approval.
