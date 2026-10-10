# Repair Audit vs. Release Authorization

**Decision:** 2026-10-10 — Establishing the governance pattern across the portfolio.

## Core Principle

> A passing repair audit cannot supersede a blocking release contract.

**Repair audit** = Claude identifies errors, fixes them in code, verifies locally/in tests.

**Release authorization** = Project's capability contract determines readiness (not Claude's audit).

These are separate authority domains.

---

## Why This Matters

When Claude reports "61 errors fixed, tests pass, production ready," that is **not** the same as:
- "The project's capability contract approves release"
- "All security gates are cleared"
- "Production deployment is authorized"

Example: StoryEngine (2026-10-09/10-10)
- ✅ Repair audit: Found 54 unguarded routes, fixed them, tests pass
- ❌ Release authorization: Project says AUTH=BLOCKED, DEPLOY=UNVERIFIED
- **Correct outcome: Hold release. Continue verification.**

---

## Governance Pattern Across Portfolio

This rule applies to all governed projects:

| Project | Repair Status | Release Status | Next Action |
|---------|---------------|----------------|-------------|
| Chief AI | Fixes implemented | Waiting on tests | Run CI validation |
| StoryEngine | Authorization added (54 routes) | AUTH=BLOCKED | Route inventory audit |
| Se'kret Bip | Migration merged to main | NOT DEPLOYED | Await founder approval + StoryEngine AUTH clear |
| JBH | Verified secure | Compliance check pending | Security review completion |

---

## Decision Record Format

For each project, maintain:

```
PROJECT / STATUS

Source:
- Repair audit: COMPLETE/IN_PROGRESS/BLOCKED
- Test status: PASSING/FAILING/INCONCLUSIVE
- Code review: APPROVED/PENDING/ISSUES

Release:
- Capability contract: [CURRENT_STATE]
- Authorization gates: [GATE_STATUS]
- Next verification: [REQUIRED_STEP]

Decision: HOLD/PROCEED/DEFERRED_UNTIL
```

---

## Application to Founder Gates

The three founder gates (GitHub App, Cloudflare Access, Se'kret Bip migration) are **deferred pending StoryEngine AUTH clearance**.

Reason: All cascades depend on StoryEngine authorization verification. Cannot execute gates until that foundation is verified.

---

## Verification Authority Chain

1. **Project capability contract** (source of truth for readiness)
2. **Claude repair audit** (finds and fixes real errors)
3. **Founder gates** (authorizes irreversible changes)

Claude's audit informs but does not override the project's contract.

---

## Next Steps for StoryEngine

1. Route inventory audit (read-only) — verify all 54 routes have guards
2. Cross-tenant denial test (runtime) — prove authorization actually rejects bad requests
3. CSP hardening (security) — complete browser policy
4. Stripe webhook verification (provider proof) — verify payment integrity
5. Attach CI evidence to capability contract
6. Update capability contract: AUTH=VERIFIED
7. Only then: execute founder gates

---

## Record Created

Decision: 2026-10-10 15:00 UTC
Authority: FCR governance (Founder Control Room)
Applies to: All portfolio projects (Chief, Bip, StoryEngine, JBH, Think Tank)
Pattern: Repair audit ≠ Release authorization
