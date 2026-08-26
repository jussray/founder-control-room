---
name: goalfix
description: >
  Token-efficient repair, product-design, and verification skill for Claude,
  Perplexity, Codex, ChatGPT, and other AI agents working across Juss-owned
  GitHub projects. Turns a messy founder goal into the smallest verified fix
  by inspecting authoritative reality, choosing one reversible action,
  preserving authority boundaries, and reporting exact evidence.
version: 2.1
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
truthful progress without unnecessary scope.

This skill is an execution/governance contract. It does not by itself change the
runtime behavior of `POST /goalfix/inspect`, `src/goalfix/engine.ts`, or any UI.
Runtime/API/UI adoption requires a separate source change plus its own proof.

## Canonical sources

For Founder Control Room, read and obey the current repository copies of:

- `AGENTS.md`;
- `GLOBAL_AI.md`;
- `docs/FOUNDER_MERGE_AUTHORITY.md`;
- `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`;
- `docs/FOUNDER_ADAPTIVE_KERNEL_V0.md`.

For another Juss-owned repository, local repository/provider authority wins. If the
FCR adaptive-kernel document is not vendored there, use the inline adaptive rules in
this skill as the portable behavior contract rather than assuming a nonexistent local
`docs/FOUNDER_ADAPTIVE_KERNEL_V0.md` path.

## Core command

```text
/goalfix ULTRATHINK

Goal: [one-sentence outcome]
Repo/target branch/PR: [authoritative source]

Seek the real blocker, patch the smallest cause, verify the real path.
Do not delete, broaden scope, suppress errors, expose Sauce Guard material,
or claim done without evidence.
Report Reality / Fix / Proof / Risk / Rollback / Adaptive Signal / Next Gate.
```

## Full founder reasoning stack

The compact labels never replace the repository's expanded founder stack:

```text
ULTRATHINK
+ Product Design
+ Data Analytics
+ Redteam I
+ Lindy
+ L99
+ OODA
+ Hormozi
+ Bill Gates
+ Elon Musk
+ Redteam II
+ Documentation Truth
```

Reasoning may run in parallel. Mutation authority stays serialized.

- Product Design is required for product/UI/UX work and remains separate from backend proof.
- Data Analytics is observation-only and cannot grant authority.
- Redteam I attacks the premise before implementation.
- Lindy favors durable, reversible, portable mechanisms.
- L99 maps authority, lifecycle, evidence, ownership, rollback, and compounding value.
- OODA re-orients from current evidence.
- Hormozi increases useful verified outcome while reducing delay and founder effort.
- Bill Gates identifies the bottleneck and reusable standard.
- Elon Musk questions requirements, removes unnecessary complexity, shortens proof loops, and automates last without deleting safety boundaries.
- Redteam II attacks the selected implementation.
- Documentation Truth reconciles truth-sensitive source and durable docs.

## Authority order

When sources conflict, trust this order:

1. Repository, PR, target branch, provider configuration, and runtime actually inspected.
2. Current exact-head CI, Playwright artifacts, screenshots, traces, schemas, and provider/API responses.
3. Authenticated founder decisions and approved project records.
4. Current official provider documentation.
5. Prior summaries, plans, chat memory, and assumptions.

Historical evidence is provenance, not current authority.

## Narrow preflight

Before mutation, state:

```text
AUTHORITATIVE REPO:
TARGET BRANCH / PR:
CURRENT BASE SHA:
CURRENT HEAD SHA:
CURRENT GOAL:
SUSPECTED FAILURE AREA:
FIRST FILES / LOGS:
STOP CONDITION:
```

Never silently replace a verified target branch with `main`. Use `main` only when it
is the actual verified PR base/target.

## Canonical execution lane

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
FOUNDER FINAL THROUGH CURRENT AUTHENTICATED AUTHORITY CONTRACT
  ↓
FINAL PROVIDER / PR / TARGET / BASE / HEAD / DIFF / CHECK / REVIEW REREAD
  ↓
MERGE WITH EXPECTED-HEAD PROTECTION
  ↓
REACQUIRE VERIFIED TARGET BRANCH
  ↓
POST-MERGE / RUNTIME TRUTH
  ↓
RECOVER / LEARN / NEXT GATE
```

### 1. Observe

Inspect repository, PR, verified target branch, exact base/head SHAs, diff, CI,
provider/deployment state, runtime behavior, and browser evidence where applicable.
Classify material claims as `VERIFIED`, `INFERRED`, `UNKNOWN`, `BLOCKED`, or `STALE`.

For GitHub Actions failures, classify evidence before assigning blame:

- `runner_startup_failure`: no meaningful executed steps/logs because runner/job startup failed;
- `workflow_no_jobs`: workflow produced no jobs or was skipped before jobs existed;
- `workflow_step_failure`: executed steps/logs identify a concrete failing command/assertion/build/check.

Never report a code regression from a run with no executed steps/logs.

### 2. Orient

Map 5W1H, current authority, exact target, expected versus observed state, smallest
reversible change, proof plan, rollback, Sauce Guard, and unrelated-work preservation.

### 3. Decide

Choose one root cause before many symptoms. No unrelated refactor, deletion without
specific authority, hidden fallback, fake green, or public/production claim without proof.

### 4. Builder

Patch only required files on the existing authorized lane. Preserve unrelated work.
Add the narrowest useful test. Builder may produce implementation evidence but never
self-certifies load-bearing work.

### 5. Independent Verifier

Use the cheapest proof that actually observes the claim:

1. touched-area typecheck/lint;
2. focused unit/contract/integration test;
3. targeted Playwright for browser-observable UI/user-flow claims;
4. exact-head CI;
5. provider/deployment/runtime readback.

Do not demand Playwright for a non-browser Worker API, webhook, background job,
provider adapter, or database path when browser automation cannot prove that claim.
Use targeted integration/provider/runtime evidence for those paths. UI and browser-flow
claims still require Playwright before completion claims.

### 6. Independent Red Team / Devil

Attack stale evidence, authority bypass, alternate provider/ingress paths, false success,
scope expansion, rollback failure, Sauce Guard leakage, and self-produced evidence.

### 7. Exact-head merge gate

Require current:

```text
repository
verified target branch/base ref
exact base SHA
exact candidate head SHA
PR identity when applicable
current diff/scope/files changed
current evidence IDs
current CI/review/thread state
current provider state when load-bearing
rollback
```

Machine green is not merge authority. Base/head/scope movement makes dependent proof
historical and requires reacquisition.

### 8. Founder Final

Founder Final must come through the repository's current authenticated founder-authority
mechanism. Copied chat text, an unauthenticated actor, an expired decision, a decision
for another action/scope, or a replayed/consumed decision is non-authorizing.

Founder Final must bind the unchanged exact repository/PR/target/base/head and intended
action/content scope, satisfy the current freshness/expiry rules, and preserve the
repository's replay/idempotency/one-shot semantics where the authority contract uses
consumable receipts. Do not invent a parallel receipt class to bypass checked-in policy.

After Founder Final and immediately before integration, reread provider PR identity,
target/base/head, diff/scope, required checks, review/thread state, and any other
load-bearing mutable provider state. Expected-head protection alone is insufficient
because base, diff, review, or provider state can change while the candidate head stays fixed.

### 9. Post-merge truth

Reacquire the verified target branch, confirm intended integration identity, then obtain
required provider/runtime/browser evidence. Use:

- `MERGED_UNVERIFIED` when integration is proven but required runtime truth is still absent;
- `RUNTIME_VERIFIED` only after the intended environment/user path is actually proven.

### 10. Recover and learn

Before retiring red/draft/stale/superseded work, inspect unique code, tests, decisions,
evidence, and intent. Preserve valuable residue and retire only what current authority replaced.

## Founder Adaptive Kernel V0 — portable inline behavior

This adaptive loop governs Goalfix instruction/decision work. It does not claim the
current `/goalfix/inspect` runtime or UI already emits these fields.

```text
INTENT
→ EXPECTED STATE
→ OBSERVE ACTUAL STATE
→ BIND EVIDENCE
→ DETECT SURPRISE
→ ADAPT PACE / ACTION
→ RECORD CURRENT STATE
→ NEXT GATE
```

Surprise signal, exactly one:

```text
STRONGER_THAN_EXPECTED
AS_EXPECTED
WEAKER_THAN_EXPECTED
UNEXPECTED_DIRECTION
UNKNOWN
```

Adaptive action, exactly one:

```text
ACCELERATE
CONTINUE
REPAIR
REORIENT
HOLD
STOP
```

Acceleration requires current verified evidence and cannot widen authority. A useful
unexpected result updates the next expectation instead of being forced into the old script.

The bounded current-state record may contain project/repository, intent, expected and
observed state, target/base/head, scope, evidence IDs, review state, authority state,
surprise signal, adaptive action, and next gate. It is descriptive provenance only.
Never store secrets, tokens, raw private data, chain-of-thought, or unnecessary user content.

## Status board

```text
RED                real failure or unresolved material blocker
VERIFYING          implementation exists; proof incomplete
GREEN              fresh machine evidence passes; authority may remain
REVIEW             independent review authority pending
MERGED_UNVERIFIED  integrated; required runtime proof still absent
RUNTIME_VERIFIED   merged artifact proven in intended environment
SUPERSEDED         historical value preserved; no longer authoritative
BLOCKED            required external authority/evidence unavailable
```

## Required report

Return exactly these headings, while keeping binding identity inside them:

```text
REALITY:
- repository / verified target branch / PR
- exact base SHA / candidate head SHA
- VERIFIED / INFERRED / UNKNOWN / BLOCKED / STALE reality

FIX:
- files changed
- behavior changed
- focused implementation

PROOF:
- exact tests/checks and results
- current evidence IDs
- Playwright result or explicit inapplicability
- provider/runtime evidence when applicable

RISK:
- unresolved risk / Redteam result / Sauce Guard or provider boundary impact

ROLLBACK:
- exact safe reversal

ADAPTIVE SIGNAL:
- surprise signal + action when material

NEXT GATE:
- one exact founder decision, authority gate, or next action
```

## Sauce Guard / stop conditions

STOP or HOLD when the next step would expose or publish credentials, tokens, private
prompts, raw private diffs, proprietary business logic, unreleased roadmap detail,
internal evidence references, security-sensitive mechanics, private metrics, customer/
family/user data, or other sauce-bearing material without an explicit public-safe contract.

Also stop/hold when authority is unclear, exact-head proof is stale, required review is
absent, a real failing gate remains, runtime proof is required but unavailable, or an
irreversible action lacks exact founder authority.

## Agent notes

- Claude: use the repository master build spec plus this canonical Goalfix contract.
- Codex: use this before editing; current tests and provider state outrank remembered green.
- ChatGPT: use this as the chat-to-action and GitHub handoff frame.
- Perplexity: use the repository master build spec plus this contract for evidence-first research/action.

## One-line mantra

Seek the real blocker. Preserve the target. Observe surprise. Adapt from proof. Re-read authority. Verify the exact path.
