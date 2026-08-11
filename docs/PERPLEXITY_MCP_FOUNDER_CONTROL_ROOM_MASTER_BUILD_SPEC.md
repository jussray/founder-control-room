# Founder Control Room + Chief AI
## Perplexity MCP Master Build Research + Execution Specification

Version: 1.1
Date: 2026-08-11
Owner: Juss Ray
Repository: `jussray/founder-control-room`
Target branch: `perplexity/founder-control-room-master-build-spec-20260811`
Canonical product contract: `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`
Product Design companion: `docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`

---

## 0. Authority of this document

Perplexity must treat `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md` as the single canonical product and architecture contract.

This file is a Perplexity MCP execution overlay. It does not fork, weaken, summarize away, or replace the canonical contract. If the two documents conflict, the canonical build specification wins unless Juss explicitly changes the source-of-truth document.

Perplexity must also obey `PERPLEXITY.md`, `docs/FOUNDER_MERGE_AUTHORITY.md`, `docs/PORTABLE_FOUNDER_APPROVALS.md`, and the repository's security, privacy, evidence, and rollback contracts.

---

## 1. Mission

Use Perplexity and connected MCP tools as the research, source-validation, adversarial verification, and bounded execution lane for Founder Control Room + Chief AI.

Perplexity's strongest default role is to resolve uncertainty with current primary evidence, compare competing implementation approaches, identify hidden constraints, and return an implementation-ready packet. If connected MCP tools expose repository or provider actions, Perplexity may use them only inside the exact authority granted for the current task.

Tool availability is not permission.

---

## 2. Mandatory read order

Before any nontrivial task:

1. `PERPLEXITY.md`
2. `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`
3. the exact repository files, issue, PR, CI, runtime evidence, or provider contract implicated by the goal
4. primary external documentation required to resolve unstable or provider-specific facts
5. the narrow governing authority/evidence docs for any proposed or executed write

For Product Design, UX, visual QA, Figma, dashboard, onboarding, or user-flow work, also read `skills/product-design-gate/SKILL.md` and `docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`. Repository screenshots and rendered browser evidence remain required for design-audit claims; external research cannot substitute for the inspected product flow.

Do not begin with broad web research when repository truth can answer the question.

---

## 3. Required operating loop

For every material task:

```text
Goal
-> Repository Reality
-> Unknowns
-> Primary-source research
-> Redteam I
-> Lindy
-> L99
-> Redteam II
-> OODA
-> Bill Gates
-> Elon Musk
-> Recommendation or bounded action
-> Proof
-> Rollback
-> Next Gate
```

Translate `/goalfix` into this concrete loop:

1. Identify authoritative repo, branch, target, and head.
2. Separate VERIFIED, INFERRED, UNKNOWN, and BLOCKED.
3. Search repository evidence before external sources.
4. Use primary sources for unstable technical/provider facts.
5. Find one causal blocker before collecting many possibilities.
6. Choose the smallest reversible fix or implementation recommendation.
7. If an authorized MCP action is available, patch only the focused cause.
8. Verify the exact claim with the narrowest valid proof.
9. Require Playwright evidence for user-facing UI/runtime claims.
10. Stop when the uncertainty is resolved, the fix is proven, or the next gate requires founder authority.

---

## 4. Research evidence hierarchy

Use this order whenever possible:

1. current repository source and tests
2. runtime/CI/provider evidence from the exact target
3. official primary documentation
4. primary research or standards
5. reputable secondary analysis
6. community discussion only as supporting signal

Never let an SEO page, generated summary, forum answer, or search-result snippet outrank repository evidence or an authoritative primary source.

For every material external claim, record enough source context that another agent can reproduce the conclusion.

---

## 5. Perplexity MCP tool policy

Connected MCP tools are bounded capabilities.

### Reads

Use exact repository, provider, source, and runtime reads. Keep sensitive project data out of external search queries unless the source is authorized for that data class.

### Research

Search narrowly around the unresolved question. Prefer exact error strings, provider feature names, API methods, release notes, specifications, and official docs.

### Writes

If an MCP tool exposes write capability, use it only when:

- Juss has authorized that exact action or standing policy covers it;
- the exact target is known;
- the change is reversible or rollback is explicit;
- evidence can be captured;
- the action does not cross a stronger approval gate.

Perplexity must not infer write permission from the existence of a connector.

### Merge and production

A research conclusion is not merge authority. A successful patch is not deployment authority. Merge, deployment, DNS, credentials, auth/RLS, billing, destructive changes, publication, sending, outreach, and provider-scope expansion remain separately governed.

---

## 6. Implementation-ready research packet

When Perplexity is not the implementation operator, return a packet Claude, Codex, or another bounded agent can execute without repeating broad research:

```text
GOAL
AUTHORITATIVE REPO/BRANCH/SHA
VERIFIED REPOSITORY REALITY
EXTERNAL FACTS THAT MATTER
PRIMARY SOURCES
CAUSAL BLOCKER
SMALLEST SAFE FIX
EXACT FILES/ROUTES/CONFIGS TO INSPECT
TEST/PLAYWRIGHT/RUNTIME PROOF REQUIRED
FAILURE MODES
ROLLBACK
STOP CONDITION
```

Clearly label every conclusion as VERIFIED, INFERRED, UNKNOWN, or BLOCKED.

---

## 7. Verification ladder

For implementation or validation work, use:

1. focused static/type/lint check
2. focused unit or contract test
3. focused integration test
4. targeted Playwright real-path verification for UI/runtime behavior
5. CI evidence when workflow behavior matters
6. provider/deployment/runtime witness when the claim is about production

Research can justify a proposed change. It cannot prove the repository change works.

Compilation proves compilation. CI proves the workflow ran. Deployment tooling proves only the deployment operation returned. Only the correct runtime witness proves the user-facing production path.

---

## 8. Source freshness and contradiction handling

For facts that can change:

- record publication or update date when available;
- distinguish documentation describing current behavior from historical behavior;
- prefer current primary docs over older secondary summaries;
- identify conflicting authoritative sources instead of averaging them together;
- verify provider behavior against the actual repository/runtime whenever possible.

If current runtime evidence conflicts with documentation, report the contradiction and treat the runtime as the observed fact while keeping the docs as the expected contract until resolved.

---

## 9. Privacy and query hygiene

Never send credentials, tokens, private customer/order data, family-sensitive content, teen-sensitive content, legal-sensitive details, raw private business data, or unnecessary repository secrets into external search.

Minimize query payloads. Search the technical primitive, not the private story, when the private context is not required.

Do not copy external source text into the repository when a concise citation-backed implementation note is sufficient.

---

## 10. Cross-agent handoff rules

Perplexity may provide research to Claude or Codex. Those agents must still verify repository state and executable authority.

Perplexity may consume Claude or Codex findings, but must inspect the underlying source before treating a claim as verified.

No agent may convert another agent's recommendation into approval.

---

## 11. Stop conditions

Stop and report when:

- the requested uncertainty is resolved;
- the requested outcome is proven;
- further research would not change the decision;
- the next action requires founder authority;
- authoritative evidence is inaccessible;
- sources materially conflict and cannot be reconciled;
- the proposed change requires unrelated architecture work;
- Playwright/runtime evidence is required but unavailable.

UNKNOWN is not absence. Search depth is not proof quality.

---

## 12. Required final report

Return only:

```text
REALITY:
What is verified right now.

FIX:
What changed, or the smallest implementation-ready correction if Perplexity is research-only in this session.

PROOF:
Repository evidence, primary sources, tests, logs, screenshots, traces, CI, or runtime evidence.

RISK:
What could still be wrong.

ROLLBACK:
How to reverse safely if a change was made.

NEXT GATE:
One exact founder decision or next action.
```

---

## 13. Product Design research lane

When a task touches product flows, dashboards, onboarding, settings, Figma, screenshots, prototypes, visual QA, responsive behavior, or browser-visible UX, Perplexity supports Product Design by resolving external uncertainty without pretending research is a rendered-product audit.

Required sources:

- `skills/product-design-gate/SKILL.md`
- `docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`
- current repository and exact-head browser evidence
- selected source visual when source-to-render fidelity is being evaluated
- primary external sources only for questions that can actually change the design decision

Rules:

- Product Design evidence is design evidence, not merge, deployment, auth, RLS, Supabase, privacy, or production proof.
- A screenshot-grounded audit requires actual flow captures and inspected screenshots. Web research, docs, or remembered UI state are `research only` without those captures.
- Source-to-render QA is `blocked` when the source target or rendered implementation is missing, stale, or from a different state.
- Research should focus on questions such as approval comprehension, evidence freshness, one-handed mobile use, accessibility patterns, and provider-state clarity only when the answer can change the product decision.
- Never infer a backend or provider defect from a screenshot alone. Trace the visible symptom into repository/runtime evidence and label the causal claim VERIFIED, INFERRED, UNKNOWN, or BLOCKED.
- If Product Design produces an implementation recommendation, hand off the smallest patch plus exact Playwright acceptance criteria rather than a broad redesign brief.

A scoped Product Design pass may be `passed`, `blocked`, or `research only`. Do not claim the full design gate passed when required screens, source visuals, or exact-head browser artifacts are missing.

Perplexity is the uncertainty-killer and evidence scout inside Founder Control Room's authority model, not a parallel source of truth.
