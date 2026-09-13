# Provider Sovereignty Contract

## Purpose

Founder Control Room is the single founder operating system. Every current and future Juss-owned project or FCR-managed subsystem must remain capable of preserving its core identity, contracts, data semantics, and founder intent when an external provider, SDK, API, model, runtime, connector, or vendor becomes unavailable, unaffordable, deprecated, revoked, rate-limited, materially changed, or untrusted.

External providers supply replaceable capability. They do not own project identity, authority, truth, or completion state.

## Canonical rule

```text
Founder Intent
→ Project-owned contract
→ Project-owned capability/runtime boundary
→ Provider adapter(s)
→ Provider execution
→ Project-owned validation / evidence / receipt
→ FCR outcome + next gate
```

A provider loss may reduce capability or quality. It must not silently erase the project's operating logic or create a second founder OS.

## Sovereignty invariants

1. **Own the contract**
   - Critical inputs, outputs, errors, state transitions, authority rules, evidence requirements, and completion semantics must be defined by project-owned code/contracts.
   - Do not expose provider-specific request/response shapes as the canonical application contract unless the product itself is intentionally provider-specific.

2. **Adapters, not identity**
   - OpenAI, Anthropic, OpenRouter, Supabase, Cloudflare, Firebase, Shopify, GitHub, Vercel, n8n, Stripe, email providers, analytics providers, and future vendors are adapters/execution surfaces.
   - Provider SDKs may be used behind project-owned interfaces but must not become the only definition of a critical capability.

3. **No existential single-provider dependency**
   - For every critical external dependency, classify `REPLACEABLE`, `DEGRADED_FALLBACK`, `HARD_DEPENDENCY`, or `UNKNOWN`.
   - `HARD_DEPENDENCY` is allowed only when explicitly documented with why replacement is not currently practical, what data/export/rollback path exists, and what founder-visible failure occurs if it disappears.

4. **Fallback is capability-specific**
   - Prefer at least one alternate provider, local/open implementation, deterministic fallback, export/manual recovery path, or safe degraded mode for critical capability.
   - Never fake equivalent quality. A fallback may honestly return `DEGRADED`, `UNAVAILABLE`, or `MANUAL_RECOVERY_REQUIRED`.

5. **Data portability**
   - Critical project state must have an owned schema or exportable representation sufficient to migrate providers without reconstructing product meaning from a vendor dashboard.
   - Provider IDs may be stored as provenance, not as the sole semantic identity of project records.

6. **Authority survives provider swaps**
   - Authentication, approval, consequence classification, and mutation authority must not silently broaden because a fallback provider uses a different SDK or permission model.
   - Provider credentials remain behind the adapter boundary.

7. **Evidence survives provider swaps**
   - Every adapter maps provider-specific outcomes into project-owned receipts/evidence states.
   - Provider acceptance and founder-goal outcome remain separate.

8. **FCR cohesion remains mandatory**
   - Sovereign subsystems are not separate operating systems.
   - They keep independent contracts so they can survive vendor loss, while FCR remains the founder-facing orchestration, authority, evidence, outcome, and next-gate plane.

## Required project audit

For each current or future project, answer:

```text
CORE_CAPABILITY
What must still exist if every named vendor vanished?

OWNED_CONTRACT
Which project-owned interface/schema defines that capability?

DEPENDENCIES
Which external providers/SDKs/APIs currently implement it?

CLASSIFICATION
For each dependency: REPLACEABLE | DEGRADED_FALLBACK | HARD_DEPENDENCY | UNKNOWN

FAILOVER
What alternate adapter, local implementation, deterministic fallback, export path, or safe degraded mode exists?

DATA_EXIT
Can critical state be exported/migrated without losing product meaning?

AUTHORITY
Does a provider swap preserve the same authority ceiling?

EVIDENCE
Does every adapter return the same project-owned receipt/evidence semantics?

COHESION
Does this still serve the shared FCR founder-intent loop rather than becoming a parallel OS?
```

## Future-project gate

A new project is not architecture-complete until it declares:

- its project-owned core contract;
- critical provider dependencies;
- dependency classifications;
- provider adapter boundary;
- data exit/migration path;
- failover/degraded-mode behavior;
- authority invariants;
- evidence/receipt mapping; and
- FCR integration boundary when the project is founder-operated through FCR.

Do not require unnecessary multi-provider code on day one. Require the owned interface and explicit escape route on day one, then implement alternate adapters when consequence, cost, reliability, launch stage, or dependency risk justifies them.

## Attack-6990 failure test

Before calling a project resilient, attack these failures:

- primary LLM provider unavailable;
- API key revoked;
- provider SDK breaks after upgrade;
- rate limit or quota exhausted;
- pricing becomes uneconomic;
- provider changes response schema;
- provider removes a feature/model;
- cloud region/runtime outage;
- account suspension or connector disconnect;
- vendor acquisition/shutdown;
- auth provider outage;
- database/storage export required;
- webhook delivery loss;
- analytics provider returns no data;
- provider reports success but outcome is unverified;
- fallback provider has broader permissions;
- stale approval is replayed after failover;
- duplicate mutation occurs during provider retry;
- provider-specific IDs leak into canonical domain identity.

Any failure that destroys project meaning, silently broadens authority, loses critical state, or allows false completion is a sovereignty blocker.

## Workflow integration

Use the existing founder workflow:

```text
Goal
→ Reality
→ ULTRATHINK
→ Redteam I
→ Lindy
→ L99
→ OODA
→ smallest reversible implementation
→ focused tests
→ real-path evidence
→ Redteam II / Attack-6990
→ Documentation Truth
→ Rollback
→ Next Gate
```

Add one mandatory question during Reality and Redteam II:

> If the current external provider disappeared now, what exactly would stop, what would survive, and what evidence proves the answer?

## Truth rule

Documentation that names a fallback is not proof that the fallback works. Classify repository contract, adapter implementation, focused test, CI, deployed runtime, provider failover, data export/import, and real user-path evidence separately.

## Rollback

This contract changes architecture and audit expectations only. It does not authorize provider migrations, new paid services, credential changes, data movement, deployment, or destructive replacement. Those remain separately gated.