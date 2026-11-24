# Founder Control Room + Chief AI Master Build Spec v1.4 Addendum

**Status:** approved ULTRATHINK Self-Attack implant  
**Base:** `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md`  
**Prior reconciliation:** `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_3_ADDENDUM.md`  
**Effective version:** **v1.4**  
**Authority date:** 2026-09-08

This addendum is additive. It does not weaken v1.3 V10, Product Design, privacy, evidence, federation, or merge-truth rules. Repository/provider/runtime truth outranks prose. Stricter product-local contracts win, especially Se'kret Bip teen/family privacy rules and existing FCR V10 privileged execution.

```text
v1.2 base + v1.3 addendum + this v1.4 addendum
+ Juss Flow directive + V10 FutureYOU/Me directive
= effective master specification v1.4
```

---

## 24. ULTRATHINK Self-Attack Implants

### 24.1 Value-first sequencing
Start from the founder outcome. Phases 0-3 ship only coherent vertical slices. No horizontal platform build unless the selected slice requires it.

### 24.2 Sole first-slice boundary
Canonical first slice:

```text
Friend Intake -> Mirror -> Tags -> exactly one move -> Provenance -> Timeline
```

For this revised slice: deterministic stub only; no external model call, related-memory retrieval, provider write, publishing, deployment, scheduling, or broad folder migration. Existing live model/memory paths are not reclassified as this slice.

### 24.3 Truth resolution
Canonical contract: `src/truth/truth.ts`.

Precedence:
1. fresh `live_provider`;
2. matching `exact_target_verification`;
3. integrity-verified `hashed_artifact`;
4. target-bound `test_execution`;
5. labeled `model_inference`;
6. `founder_note`, subject to authoritative override.

Every founder-visible operational claim binds to a `TruthClaim`. Green renders only when status is `verified`, freshness is current, target fingerprint matches when applicable, compatible evidence exists, and no unresolved conflict is attached. Claims must carry `doesNotProve`. Typed evidence and claim/evidence links are required.

### 24.4 Cryptographic approval binding
Canonical contract: `src/approvals/approval.ts`.

Every new external write binds actor, normalized action, SHA-256 normalized payload hash, target ID, exact target fingerprint, provider capability, project, branch when relevant, risk class, expiry, rollback reference, and unique idempotency key.

Mismatch, expiry, replay, or stale fingerprint invalidates execution. Git uses exact SHA; artifacts use content digest; provider resources use ETag/revision/immutable provider identity.

**Migration guard:** current V10 privileged approval middleware stays authoritative until a separately reviewed migration intentionally adopts this generic binding. No duplicate live authority engine and no widened ceiling.

### 24.5 Protective tiny move
Canonical contract: `src/chief/firstSliceContracts.ts`.

Exactly one outcome:
- `tiny_move`;
- `protective_move`;
- `clarifying_question`.

Tiny moves are reversible and 5-15 minutes. Legal, health, teen, family-conflict, and credential-sensitive inputs default to protective or clarifying behavior.

### 24.6 Memory minimization
Canonical primitives: `src/implant/contracts.ts`.

Default is ephemeral processing. Persistence requires explicit founder opt-in. Raw, redacted, summary, and embeddings have separate retention. No credential or sensitive-personal-data embeddings. “Process without remembering” is primary UI. Sensitive saves require review. Memory access records purpose, scope, and provenance. Product-local privacy rules may be stricter and cannot be weakened.

### 24.7 Tone Guard diff log
Every Tone Guard transform records input digest, output digest, whether it changed, summarized differences, safety notes, provenance, and timestamp. Canonical type: `ToneGuardDiffLog`.

### 24.8 Model failure posture
Canonical contract: `src/model/execution.ts`.

States: `succeeded`, `degraded`, `blocked`, `timed_out`, `budget_exceeded`, `schema_invalid`, `provider_unavailable`. UI/API must preserve the actual state. Fallbacks cannot manufacture success. In the deterministic first slice, a live-model `succeeded` state violates scope.

### 24.9 Capability manifest
Canonical contract: `src/provider/manifest.ts`.

Providers declare separate `read`, `propose`, `stage`, `execute`, and `verify` capabilities plus no-chained-write, retry, timeout, and cost constraints. Capability existence does not prove configuration, approval, execution, or outcome.

### 24.10 Three primary founder jobs
The calm cockpit has exactly three top-level jobs:
1. **Decide** current truth and next move.
2. **Authorize** an exact action on an exact target.
3. **Verify** evidence and outcome.

Canonical type: `FounderJob`.

### 24.11 Non-binary roles
Canonical roles: `founder`, `delegate`, `operator`, `auditor`. A role is a capability ceiling, not an identity shortcut. Only founder authority approves critical actions by default. Existing stricter route/session gates remain authoritative. Canonical matrix: `ROLE_CAPABILITIES`.

### 24.12 Break-glass read-only recovery
Break-glass is visibility and diagnosis only. When enabled, mutable modules fail closed. It cannot publish, merge, deploy, schedule, change credentials, or perform provider/destructive writes. Record reason, actor, activation, and expiry. Canonical type: `BreakGlassState`.

### 24.13 Value budget
Expensive runs declare estimated cost, hard ceiling, expected founder outcome, expected evidence, and whether exact founder override is required. Override applies only to that run. Canonical type: `ValueBudget`.

### 24.14 Founder-outcome metrics
Measure `yes`, `not_really`, or `wrong_time`, move completion, time-to-useful-outcome, and founder effort. Analytics is observation-only. Canonical type: `FounderOutcomeMetric`.

### 24.15 Public claim gate
Canonical contract: `src/content/publicClaimGate.ts`.

Classify claims as `verified_internal`, `externally_verifiable`, `founder_opinion`, `aspirational`, or `unsupported`. Unsupported blocks export. Aspirational must be future-tense. Opinion cannot render as verified fact. Classification stays auditable beside the content.

### 24.16 Feature-flag kill switches
Every mutable module is independently disableable. Generic modules include Chief AI, Tone Guard, sensitive detection, memory persistence, provider execution, and public export. Break-glass overrides enabled flags. Canonical helper: `mutationAllowed`.

### 24.17 Prompt regression suite
Prompt behavior is versioned behavior. Regression coverage must include schema validity, no authority expansion, privacy redaction, unsupported-claim blocking, protective moves, deterministic first-slice behavior, degraded/failure posture, and prompt-version provenance.

### 24.18 Structural completion rules
The self-attack additionally makes these binding:
- exact-target identity generalizes beyond Git SHA;
- truth color is downstream of typed evidence;
- role/model/memory/cost/recovery/publication states are explicit;
- all mutable modules have kill switches;
- reuse compatible audit/timeline/evidence primitives instead of parallel stores;
- founder value precedes platform breadth.

---

## 25. Calm Cockpit Product Design

### 25.1 Objective
Reduce founder decision entropy. Internal subsystems do not get equal visual weight.

### 25.2 Primary hierarchy
```text
DECIDE    truth -> mirror -> one move
AUTHORIZE exact action -> exact target -> bounded approval
VERIFY    evidence -> outcome -> what remains unproven
```

### 25.3 Truth visuals
No green badge may derive from a bare `ok`, `passed`, or `success` boolean. Green requires the §24.3 TruthClaim gate. Stale, inferred, conflicted, blocked, unknown, and degraded states are worded distinctly before styling.

### 25.4 First-slice UX
Mobile and desktop:
1. enter text;
2. choose `Process without saving`, `Save redacted summary`, or `Cancel` when sensitivity is detected;
3. mirror first;
4. editable intent-tag chips;
5. exactly one tiny/protective/clarifying move with time estimate and gate warning;
6. optional Tone Guard labeled `draft` with safety notes;
7. provenance drawer, plain-English first and technical detail expandable;
8. “Did this move help?” -> `yes`, `not really`, `wrong time`.

### 25.5 Minimal logical persistence
- intake with privacy/redaction choice;
- run with mirror, tags, move, and model execution state;
- provenance events;
- founder-visible timeline event.

Phase 0 must reconcile these logical records against existing tables before adding migrations. Reuse compatible structures.

### 25.6 Acceptance proof
Required when the live slice is wired:
- deterministic stub;
- focused contract tests;
- typecheck/lint;
- real desktop + mobile Playwright;
- redaction/privacy-choice flow;
- mirror render;
- exactly one move;
- provenance/evidence match;
- no green without fresh compatible evidence;
- no external provider write.

A docs/type-only implant is not browser/runtime proof of the future slice.

### 25.7 Phase 0 gate
Verify repo/branch/head, auth, routes, validation, migrations/persistence, audit/timeline/provenance/evidence, feature flags, existing Mirror behavior, test commands, Playwright setup, and cross-repo collisions. End with an exact touched-file plan. Broad migration, new dependency, unresolved authority conflict, or stale main stops implementation.

---

## Implant Definition of Done

This implant is **specified + contract-implemented** only when this addendum, canonical TypeScript contracts, focused tests, and the Phase 0 truth map land together on one exact target. It does not claim the revised Friend slice is browser-verified, runtime-verified, deployed, or launch-ready.
