---
name: goalfix
description: >
  Token-efficient repair, product-design, and verification skill for Claude,
  Perplexity, Codex, ChatGPT, and other AI agents working across Juss-owned
  GitHub projects. Turns a messy founder goal into the smallest verified fix
  by inspecting the authoritative source, choosing one reversible action,
  patching only the focused cause, and reporting evidence without burning
  unnecessary context.
version: 2.0
visibility: private
owner: Juss
triggers:
  - /goalfix
  - /fixfast
  - /repair-verify-merge
  - ULTRATHINK
  - OODA
  - REDTEAM
---

# /goalfix — Seek, Build, Fix, Verify

## Purpose

Use `/goalfix` when Juss gives a goal, bug, product-design target, GitHub task,
failed check, repo drift, launch blocker, or unclear workflow and wants fast,
truthful progress without wasting tokens.

The skill exists to prevent agents from wandering, over-reading, over-building,
rewriting unrelated files, or claiming success before proof exists.

## Core command

```text
/goalfix ULTRATHINK

Goal: [one-sentence outcome]
Repo/branch/PR: [authoritative source]

Seek the real blocker, patch the smallest cause, verify the real path.
Use Playwright for UI/runtime truth. Do not delete, broaden scope, suppress errors,
or claim done without evidence.
Report Reality / Fix / Proof / Risk / Rollback / Next Gate.
```

## Operating stack

Use the shared founder stack:

```text
lindymode → redteam → l99 → ooda
```

- Founder value: identify the user/business outcome and fastest truthful proof.
- Lindy: prefer durable, portable, reversible fixes over temporary tricks.
- Red Team / Devil: attack assumptions before and after the implementation.
- L99: map authority, lifecycle, evidence, ownership, rollback, and compounding value.
- OODA: observe, orient, decide, act minimally, verify, and loop.

## Authority order

When sources conflict, trust this order:

1. Repository, branch, PR, deployed configuration, and runtime actually inspected.
2. Current CI logs, Playwright artifacts, screenshots, traces, schemas, and API responses.
3. Explicit founder decisions and approved project records.
4. Current official provider documentation.
5. Prior summaries, generated plans, email, chat memory, and assumptions.

Historical evidence is useful provenance, but it never outranks a newer exact SHA,
provider readback, runtime observation, or changed PR head.

## Token preflight

Before reading broadly, state:

```text
AUTHORITATIVE REPO:
TARGET BRANCH / PR:
CURRENT GOAL:
SUSPECTED FAILURE AREA:
FIRST FILES / LOGS:
STOP CONDITION:
```

Work narrow-first. Prefer exact errors, failing test names, route/config names, recent
diffs, and current provider evidence over whole-repository scanning.

## Canonical workflow

```text
FOUNDER INTENT
  ↓
OBSERVE
  ↓
ORIENT
  ↓
DECIDE
  ↓
BUILDER
  ↓
INDEPENDENT VERIFIER
  ↓
INDEPENDENT RED TEAM / DEVIL
  ↓
EXACT-HEAD MERGE GATE
  ↓
FOUNDER FINAL
  ↓
MERGE WITH EXPECTED HEAD
  ↓
REACQUIRE MAIN
  ↓
POST-MERGE / RUNTIME TRUTH
  ↓
RECOVER / LEARN / NEXT GATE
```

### 1. Observe

Inspect repository, branch, PR, exact base/head SHAs, diff, CI, provider/deployment
state, runtime behavior, and Playwright evidence where applicable.

Classify material statements as:

- VERIFIED;
- INFERRED;
- UNKNOWN;
- BLOCKED;
- STALE when previously valid evidence no longer matches current state.

### 2. Orient

Map 5W1H: who owns the decision, what changes, where truth lives, when to stop or
rerun, why the change matters, and how it will be tested and reversed.

Before mutation, establish exact repository/base/head scope, founder outcome,
smallest reversible change, proof plan, rollback, and unrelated-work preservation.

### 3. Decide

Choose one root cause before many symptoms.

- smallest reversible patch;
- no unrelated refactor;
- no deletion without explicit approval;
- preserve valuable red/draft/superseded work until unique residue is reconciled;
- no public or production claim without proof.

### 4. Builder

Patch only the required files on a branch. Preserve unrelated work. Add the narrowest
useful test. Never suppress failing signals, hide errors, or fake green. Builder may
produce implementation evidence but cannot certify its own load-bearing work.

### 5. Independent Verifier

Run the cheapest valid proof first, escalating only as needed:

1. touched-area typecheck/lint;
2. focused unit/integration test;
3. targeted Playwright for real UI/browser paths;
4. exact-head CI;
5. provider/deployment/runtime readback.

Verification must bind to the actual candidate head SHA and current base. Synthetic
merge refs and old candidate heads do not satisfy exact-head proof.

### 6. Independent Red Team / Devil

Attack the exact verified candidate for authority bypass, stale evidence, alternate
provider/ingress paths, false success, scope expansion, rollback failure, hidden
errors, and self-produced evidence. Builder, Verifier, and Red Team remain separate
for load-bearing certification.

### 7. Exact-head merge gate

Require:

```text
repository
exact base SHA
exact candidate head SHA
current diff/scope
current evidence IDs
current CI/review state
rollback
```

Machine green is not merge authority. If `main` moves, prior merge-readiness becomes
historical. Reacquire the focused change on current main and rerun dependent proof.

Founder-final approval must apply to the unchanged exact candidate. Merge with
expected-head protection only after required checks and review authority are current.

### 8. Post-merge truth

Merge is not completion. Reacquire current `main`, prove merged identity, then obtain
required provider/runtime/browser evidence. UI/runtime claims require Playwright.
When runtime proof is required but absent, report `MERGED_UNVERIFIED`, not done.

### 9. Recover and learn

Before closing red, draft, stale, or superseded work, inspect it for unique code,
tests, decisions, evidence, or unresolved intent. Preserve useful residue and retire
only what current authority has actually replaced.

## Status board

```text
RED               real failure or unresolved material blocker
VERIFYING         implementation exists; proof incomplete
GREEN             fresh machine evidence passes; authority may remain
REVIEW             independent review authority pending
MERGED             integrated into current main
RUNTIME_VERIFIED   merged artifact proven in intended environment
SUPERSEDED         historical value preserved; no longer authoritative
BLOCKED            required external authority/evidence unavailable
```

## Report

Return exactly:

```text
REALITY:
[verified current state]

FIX:
[focused implementation]

PROOF:
[current exact-head tests, CI, Playwright, provider/runtime evidence]

RISK:
[what could still be wrong]

ROLLBACK:
[how to reverse safely]

NEXT GATE:
[one exact founder decision or next action]
```

## Stop conditions

Stop or hold merge when authority is unclear, exact-head evidence is stale, required
review is absent, a real failing gate remains, runtime proof is required but missing,
or the next step would expose secrets/private data or create an irreversible change
without explicit founder authority.

## Agent-specific notes

- Claude: use this as a project skill or reusable command.
- Codex: use it as the execution contract before editing files; verify with tests and Playwright where relevant.
- ChatGPT: use it as the chat-to-action frame and GitHub/Product Design handoff spec.
- Perplexity: use it for fast source discovery, docs verification, and citation-backed blocker research before code edits.

## One-line mantra

Seek the real blocker. Build the smallest fix. Verify the exact path. Preserve the founder's options.
