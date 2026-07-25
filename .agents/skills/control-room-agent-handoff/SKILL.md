---
name: control-room-agent-handoff
version: 1.0.0
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
ENVIRONMENT:
EXECUTION OWNER:
COMPLETED:
VERIFIED EVIDENCE:
FAILED OR BLOCKED:
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

## Lindy and FutureYou screen

A durable handoff should be readable by another capable agent months later, survive provider replacement, and preserve repository-native evidence. Prefer commit SHAs, files, tests, and provider identifiers over chat-specific narrative.

## Definition of done

The next agent can begin with one atomic action, knows where truth lives, knows what is proven, knows what remains blocked, and cannot reasonably mistake the handoff for broader approval.
