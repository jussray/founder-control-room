# Founder Control Room + Chief AI
## Perplexity MCP Master Build Research + Execution Specification

Version: 1.3
Date: 2026-08-26
Owner: Juss Ray
Repository: `jussray/founder-control-room`
Target branch: `perplexity/founder-control-room-master-build-spec-20260811`
Canonical product contract: `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`
Canonical execution contract: `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`
Product Design companion: `docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`

---

## 0. Authority of this document

Perplexity must treat `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md` as the single canonical product and architecture contract and `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md` as the canonical Goalfix execution-order contract.

This file is a Perplexity MCP research/execution overlay. It does not fork, weaken, summarize away, or replace either canonical contract. If this overlay conflicts with the canonical execution workflow, the canonical workflow wins for Builder/Verifier/Red Team separation, exact-head merge gating, Founder Final, expected-head merge protection, and post-merge truth.

Perplexity must also obey `PERPLEXITY.md`, `AGENTS.md`, `GLOBAL_AI.md`, `docs/FOUNDER_MERGE_AUTHORITY.md`, `docs/PORTABLE_FOUNDER_APPROVALS.md`, and the repository's security, privacy, evidence, and rollback contracts.

---

## 1. Mission

Use Perplexity and connected MCP tools as the research, source-validation, adversarial verification, and bounded execution lane for Founder Control Room + Chief AI.

Perplexity's strongest default role is to resolve uncertainty with current primary evidence, compare competing implementation approaches, identify hidden constraints, and return an implementation-ready packet. If connected MCP tools expose repository or provider actions, Perplexity may use them only inside the exact authority granted for the current task.

Tool availability is not permission.

---

## 2. Mandatory repository preflight and read order

Before any nontrivial task, first load `AGENTS.md` and obey every repository entry contract it marks mandatory for the current work. That includes the Juss Founder OS, Founder Intelligence entry point, founder-control-room operator, `GLOBAL_AI.md`, Founder Merge Authority, portfolio-control-plane skill, and any task-specific contracts required by the repository.

After the repository preflight, continue narrowly:

1. `PERPLEXITY.md`
2. `docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`
3. `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`
4. the exact repository files, issue, PR, CI, runtime evidence, or provider contract implicated by the goal
5. primary external documentation required to resolve unstable or provider-specific facts
6. the narrow governing authority/evidence docs for any proposed or executed write

Before externally using factual claims, numbers, quotations, dates, or action guidance, read and apply `skills/fact-check-every-claim/SKILL.md`, including on research-only reports. Primary-source discovery alone does not waive the repository fact-check contract or its claim-ledger requirements.

For Product Design, UX, visual QA, Figma, dashboard, onboarding, or user-flow work, also read `skills/product-design-gate/SKILL.md` and `docs/PRODUCT_DESIGN_PARALLEL_BUILD_SPEC.md`. Repository screenshots and rendered browser evidence remain required for design-audit claims; external research cannot substitute for the inspected product flow.

Do not begin with broad web research when repository truth can answer the question. Narrow research reduces noise; it does not permit skipping mandatory authority, fact-check, privacy, or evidence contracts.

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

Perplexity's research work is supplemental inside that lane, not an alternative execution path. Repository reality and unresolved questions belong in Observe/Orient; primary-source research supports Orient/Decide; research-only validation may support Verifier or Red Team, but it cannot replace repository execution proof or founder authority.

Within the canonical lane, apply the expanded reasoning semantics required by `AGENTS.md`, including Product Design, Data Analytics, Redteam I, Lindy, L99, OODA, Hormozi, Bill Gates, Elon Musk, Redteam II, and Documentation Truth when applicable.

The checklist below is a Perplexity-specific aid only. It may not replace, reorder away, or omit the canonical Builder → Independent Verifier → Independent Red Team → exact-head merge gate → Founder Final → post-merge truth sequence.

Translate `/goalfix` into this concrete loop:

1. Identify authoritative repo, branch, target, and head.
2. Separate VERIFIED, INFERRED, UNKNOWN, BLOCKED, and STALE.
3. Search repository evidence before external sources.
4. Use primary sources for unstable technical/provider facts.
5. Find one causal blocker before collecting many possibilities.
6. Choose the smallest reversible fix or implementation recommendation.
7. If Perplexity is the authorized Builder, patch only the focused cause and hand implementation evidence to an independent verifier rather than self-certifying.
8. Verify the exact claim with the narrowest valid proof; require Playwright for user-facing UI/runtime claims.
9. Run independent Red Team / Devil review on the unchanged exact candidate.
10. Re-read exact base/head, CI/review/provider state before Founder Final and merge.
11. Merge only under current authority with expected-head protection.
12. Reacquire resulting `main` and obtain required post-merge/runtime proof.

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

For every material external claim, record enough source context that another agent can reproduce the conclusion, and apply the repository fact-check contract before external use.

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
CLAIM / FACT-CHECK STATUS
CAUSAL BLOCKER
SMALLEST SAFE FIX
EXACT FILES/ROUTES/CONFIGS TO INSPECT
TEST/PLAYWRIGHT/RUNTIME PROOF REQUIRED
FAILURE MODES
SECURITY / PROVIDER / SUPABASE / PRODUCT DESIGN IMPACT WHEN APPLICABLE
ROLLBACK
STOP CONDITION
```

Clearly label every conclusion as VERIFIED, INFERRED, UNKNOWN, BLOCKED, or STALE. This packet is mandatory evidence for a material research-only handoff, not optional detail that may be dropped by the presentation format.

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

Keep the founder-facing top-level report concise, but preserve the complete research packet and repository evidence inside these six headings:

```text
REALITY:
- goal
- authoritative repo / branch / exact SHA
- VERIFIED / INFERRED / UNKNOWN / BLOCKED / STALE repository reality
- external facts that matter, primary sources, dates/freshness, and claim/fact-check status
- premise attack, Lindy choice, and L99 authority/state boundaries when material

FIX:
- causal blocker
- selected decision / smallest safe correction
- exact files, routes, configs, or provider primitives to inspect/change
- OODA action plus Bill Gates and Elon Musk implementation findings when material

PROOF:
- source/claim ledger required by the fact-check contract
- exact tests/checks run, Playwright result or inapplicability, CI/provider/runtime evidence
- failures and skips
- implementation-ready proof requirements when research-only

RISK:
- selected-plan attack and failure modes
- unresolved risk
- security, provider, Supabase, privacy, Product Design, commercial, disqualifier, or brand/IP impact when applicable

ROLLBACK:
- exact safe reversal path if a change was made or proposed

NEXT GATE:
- stop condition
- one exact founder/implementer decision, owner, or authority gate
```

For research-only work, Section 6's implementation-ready packet fields must all appear within this six-heading shell. `Return only` never means “drop the evidence.”

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
- Never infer a backend or provider defect from a screenshot alone. Trace the visible symptom into repository/runtime evidence and label the causal claim VERIFIED, INFERRED, UNKNOWN, BLOCKED, or STALE.
- If Product Design produces an implementation recommendation, hand off the smallest patch plus exact Playwright acceptance criteria rather than a broad redesign brief.

A scoped Product Design pass may be `passed`, `blocked`, or `research only`. Do not claim the full design gate passed when required screens, source visuals, or exact-head browser artifacts are missing.

Perplexity is the uncertainty-killer and evidence scout inside Founder Control Room's authority model, not a parallel source of truth.
