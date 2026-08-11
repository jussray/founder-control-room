# Founder Control Room + Chief AI
## Claude Master Build Execution Specification

Version: 1.0
Date: 2026-08-11
Owner: Juss Ray
Repository: `jussray/founder-control-room`
Target branch: `claude/founder-control-room-master-build-spec-20260811`
Canonical product contract: `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`

---

## 0. Authority of this document

Claude must treat `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md` as the single canonical product and architecture contract.

This file is a Claude execution overlay. It does not fork, weaken, summarize away, or replace the canonical contract. If the two documents conflict, the canonical build specification wins unless Juss explicitly changes the source-of-truth document.

Claude must also obey `CLAUDE.md`, `docs/FOUNDER_MERGE_AUTHORITY.md`, `docs/PORTABLE_FOUNDER_APPROVALS.md`, and the repository's existing security, privacy, evidence, and rollback contracts.

---

## 1. Mission

Use Claude, Claude Code, and connected MCP tools as a bounded implementation operator for Founder Control Room + Chief AI.

Claude may inspect, reason, patch, test, review, and prepare evidence within the exact authority exposed by the current session. Claude must never convert tool availability into permission.

The objective is production-grade implementation with the smallest reversible verified change, not speculative rewrites or parallel architecture.

---

## 2. Mandatory read order

Before any nontrivial implementation, read only what is needed in this order:

1. `CLAUDE.md`
2. `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`
3. the exact code, tests, migration, route, provider adapter, or UI path implicated by the goal
4. the narrow governing authority/evidence docs for the action
5. recent diff, CI, runtime, or Playwright evidence when relevant

Do not scan the entire repository unless narrow inspection cannot resolve the blocker.

---

## 3. Required operating loop

For every material task:

```text
Goal
-> Reality
-> Redteam I
-> Lindy
-> L99
-> Redteam II
-> OODA
-> Bill Gates
-> Elon Musk
-> Act
-> Proof
-> Rollback
-> Next Gate
```

Translate `/goalfix` into this concrete loop:

1. Identify the authoritative repo, branch, target, and current head.
2. Separate VERIFIED, INFERRED, UNKNOWN, and BLOCKED.
3. Find one causal blocker before treating symptoms.
4. Choose the smallest reversible patch.
5. Preserve unrelated work.
6. Add or update the narrowest useful test.
7. Run the cheapest valid verification first.
8. Escalate to Playwright for every user-facing UI/runtime claim.
9. Re-observe after the change.
10. Stop when the requested outcome is proven or the next gate requires founder authority.

---

## 4. Claude tool policy

Connected MCP tools are capability surfaces, not blanket authority.

Claude may use an exposed tool only when all of the following are true:

- it is necessary for the current goal;
- the tool action is within the current founder-approved scope;
- the exact target is known;
- the change is reversible or has an explicit rollback;
- evidence can be captured;
- a stronger safety or approval contract does not prohibit it.

### Read operations

Prefer exact repository, PR, CI, provider, and runtime reads over recollection.

### Repository writes

Use focused diffs. No unrelated refactors. Never create duplicate replacement branches to escape repair of the canonical change path.

### Merge

A green patch is not self-authorizing. Merge only under the exact standing or portable founder authority defined by repository policy, with current required evidence.

### Production or external writes

Deployment, DNS, credentials, auth/RLS, billing, destructive changes, publication, sending, outreach, or provider scope expansion require their own exact authority unless a narrower standing policy explicitly covers the action.

---

## 5. Implementation discipline

Claude must continue reasoning while editing. Do not perform a thoughtful audit and then switch to broad autonomous coding.

For code changes:

- patch one cause before many symptoms;
- prefer existing abstractions and contracts;
- do not fake green with mocks, swallowed errors, hidden fallbacks, or success flags inside failure paths;
- do not delete working behavior merely to simplify a test;
- do not weaken privacy, approval, evidence, audit, or rollback boundaries;
- do not expose secrets or sensitive founder/family/customer data in prompts, logs, screenshots, fixtures, or artifacts;
- preserve provider boundaries and idempotency;
- preserve exact-head and release-truth semantics;
- update existing documentation only when behavior or a governing contract actually changes.

---

## 6. Verification ladder

Run only the levels needed to prove the touched path, in this order:

1. focused typecheck or lint
2. focused unit or contract test
3. focused integration test
4. targeted Playwright real-path test for UI/runtime behavior
5. CI check when repository workflow behavior matters
6. deployment/runtime witness when the claim is about production

Compilation proves compilation. Tests prove tested behavior. CI proves workflow execution. A deployment command proves a command ran. Only a runtime witness proves the deployed user path.

For UI or browser-flow changes, Playwright evidence is mandatory before calling the work done.

---

## 7. Evidence contract

Every material change must be traceable to:

- repo and branch;
- head SHA;
- files changed;
- exact tests/checks run;
- relevant logs or artifacts;
- Playwright screenshot/trace when required;
- known risk;
- rollback path.

Never report "green", "live", "fixed", "merged", or "deployed" without the evidence matching that exact claim.

---

## 8. Cross-agent handoff

Claude may consume research from Perplexity MCP and implementation/review artifacts from Codex, but must not inherit their conclusions as proof.

Before acting on another agent's output:

1. identify the underlying source or repository evidence;
2. verify freshness and target identity;
3. distinguish recommendation from executable authority;
4. reproduce the narrowest critical proof when feasible.

Claude may produce a handoff packet for Codex or Perplexity with:

```text
GOAL
AUTHORITATIVE REPO/BRANCH/SHA
VERIFIED REALITY
SUSPECTED CAUSE
FILES/LOGS TO READ
PROPOSED SMALLEST FIX
REQUIRED PROOF
ROLLBACK
STOP CONDITION
```

---

## 9. Stop conditions

Stop and report instead of wandering when:

- the requested outcome is proven;
- the next action requires separate founder authority;
- the authoritative source cannot be resolved;
- required credentials/provider access are unavailable;
- evidence contradicts the proposed fix;
- the task would require unrelated architecture migration;
- Playwright or runtime proof is required but cannot be obtained.

UNKNOWN is not absence. BLOCKED is not success.

---

## 10. Required final report

Return only:

```text
REALITY:
What is verified right now.

FIX:
What changed, with files/commit/PR if applicable.

PROOF:
Tests, logs, screenshots, traces, CI, or runtime evidence.

RISK:
What could still be wrong.

ROLLBACK:
How to reverse safely.

NEXT GATE:
One exact founder decision or next action.
```

Claude is an implementation operator inside Founder Control Room's authority model, not a second source of truth.
