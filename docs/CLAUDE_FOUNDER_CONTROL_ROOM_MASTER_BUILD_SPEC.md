# Founder Control Room + Chief AI
## Claude Master Build Execution Specification

Version: 1.3
Date: 2026-08-26
Owner: Juss Ray
Repository: `jussray/founder-control-room`
Target branch: `claude/founder-control-room-master-build-spec-20260811`
Canonical product contract: `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`
Canonical execution contract: `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`
Product Design companion: `docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`

---

## 0. Authority of this document

Claude must treat `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md` as the single canonical product and architecture contract and `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md` as the canonical Goalfix execution-order contract.

This file is a Claude execution overlay. It does not fork, weaken, summarize away, or replace either canonical contract. If this overlay conflicts with the canonical execution workflow, the canonical workflow wins for execution order, verification separation, exact-head merge gating, founder-final authority, and post-merge truth.

Claude must also obey `CLAUDE.md`, `AGENTS.md`, `GLOBAL_AI.md`, `docs/FOUNDER_MERGE_AUTHORITY.md`, `docs/PORTABLE_FOUNDER_APPROVALS.md`, and the repository's existing security, privacy, evidence, and rollback contracts.

---

## 1. Mission

Use Claude, Claude Code, and connected MCP tools as a bounded implementation operator for Founder Control Room + Chief AI.

Claude may inspect, reason, patch, test, review, and prepare evidence within the exact authority exposed by the current session. Claude must never convert tool availability into permission.

The objective is production-grade implementation with the smallest reversible verified change, not speculative rewrites or parallel architecture.

---

## 2. Mandatory repository preflight and read order

Before any nontrivial implementation, first load the repository entry contract in `AGENTS.md` and obey every item it marks mandatory for the current work. At minimum, the repository preflight includes:

1. `.ai/skills/juss-founder-os/SKILL.md` first
2. `AGENTS_FOUNDER_INTELLIGENCE.md`
3. `.agents/skills/founder-control-room-operator/SKILL.md`
4. `GLOBAL_AI.md`
5. `docs/FOUNDER_MERGE_AUTHORITY.md`
6. `skills/portfolio-control-plane/SKILL.md`
7. the additional task-specific skills required by `AGENTS.md`

After that repository preflight, continue narrowly in this order:

1. `CLAUDE.md`
2. `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`
3. `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`
4. the exact code, tests, migration, route, provider adapter, or UI path implicated by the goal
5. the narrow governing authority/evidence docs for the action
6. recent diff, CI, runtime, or Playwright evidence when relevant

For Product Design, UX, visual QA, Figma, dashboard, onboarding, or user-flow work, also read `skills/product-design-gate/SKILL.md` and `docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md` before implementation or design claims. Apply any additional Figma/design contracts required by `AGENTS.md`.

Do not scan the entire repository unless narrow inspection cannot resolve the blocker. Narrow reading reduces context use; it does not permit skipping mandatory authority, privacy, project-isolation, or evidence contracts.

---

## 3. Required operating loop

The canonical execution order is `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`:

```text
Founder Intent
-> Observe
-> Orient
-> Decide
-> Builder
-> Independent Verifier
-> Independent Red Team / Devil
-> Exact-head Merge Gate
-> Founder Final
-> Merge With Expected Head
-> Reacquire Main
-> Post-merge / Runtime Truth
-> Recover / Learn / Next Gate
```

Within that lane, Claude must apply the expanded reasoning semantics required by `AGENTS.md`, including Product Design, Data Analytics, Redteam I, Lindy, L99, OODA, Hormozi, Bill Gates, Elon Musk, Redteam II, and Documentation Truth when applicable.

The checklist below is a Claude-specific implementation aid only. It may not replace, reorder away, or omit the canonical Builder → Independent Verifier → Independent Red Team → exact-head merge gate → Founder Final → post-merge truth sequence.

Translate `/goalfix` into this concrete loop:

1. Identify the authoritative repo, branch, target, and current head.
2. Separate VERIFIED, INFERRED, UNKNOWN, BLOCKED, and STALE.
3. Find one causal blocker before treating symptoms.
4. Choose the smallest reversible patch.
5. Preserve unrelated work.
6. Add or update the narrowest useful test.
7. Hand implementation evidence to an independent verifier rather than self-certifying.
8. Escalate to Playwright for every user-facing UI/runtime claim.
9. Run independent Red Team / Devil review on the unchanged exact candidate.
10. Re-read exact base/head, CI/review/provider state before Founder Final and merge.
11. Merge only with expected-head protection under current authority.
12. Reacquire resulting `main` and obtain required post-merge/runtime proof.

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

Keep the founder-facing top-level format concise, but do not omit the mandatory repository evidence fields. Return these six headings, with the required evidence nested inside them:

```text
REALITY:
- goal and verified current reality
- authoritative repo / branch / exact SHA
- VERIFIED / INFERRED / UNKNOWN / BLOCKED where material
- premise attack, Lindy choice, and L99 authority/state boundaries

FIX:
- selected decision and OODA action
- files changed and behavior changed
- Bill Gates bottleneck/leverage finding
- Elon Musk requirement/deletion/simplification/feedback/automation finding

PROOF:
- exact tests/checks run and results
- behavior-test status
- Playwright result/artifacts or explicit inapplicability
- CI, provider, Cloudflare, Control Room, deployment, or runtime evidence when applicable
- failures and skips
- Product Design evidence status when applicable

RISK:
- selected-plan attack
- unresolved risk
- security, provider, Supabase, commercial, disqualifier, brand/IP, privacy, or project-boundary impact when applicable

ROLLBACK:
- exact safe reversal path

NEXT GATE:
- stop condition reached or remaining blocker
- one exact next authority/owner/action gate
```

The six headings are a presentation shell, not permission to discard the evidence report required by `AGENTS.md`.

---

## 11. Product Design lane

When a task touches product flows, dashboards, onboarding, settings, Figma, screenshots, prototypes, visual QA, responsive behavior, or browser-visible UX, Claude must apply the existing Product Design contracts rather than inventing a parallel design process.

Required sources:

- `skills/product-design-gate/SKILL.md`
- `docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`
- the current rendered implementation or exact-head browser capture
- the selected source visual when source-to-render fidelity is being claimed

Rules:

- Product Design evidence is design evidence, not merge, deployment, auth, RLS, Supabase, privacy, or production proof.
- A screenshot-grounded audit must inspect the actual captured flow and tie every finding to a screenshot, step, or named blocker.
- Source-to-render QA is `blocked` if either the selected source visual or rendered implementation is missing or stale.
- Do not convert a focused visual defect into an unsolicited redesign.
- When Product Design produces a code fix, use the smallest focused repository patch and exact-head Playwright proof before merge-ready claims.
- Never infer a backend or provider defect from visual evidence alone. Trace expected-versus-actual behavior into repository/runtime evidence first.

A scoped Product Design pass may be `passed`, `blocked`, or `research only`. Do not claim the full design gate passed when only a subset of required screens or states was captured.

Claude is an implementation operator inside Founder Control Room's authority model, not a second source of truth.
