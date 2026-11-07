# L99 OODA Implementation Plan

> **Red Team / Lindy / Elon / Bill Gates / OODA**  
> Last updated: 2026-09-04  
> Status: **ACTIVE — standalone launch track + exact-head federation proof contract**

---

## First Principles (Elon mode)

Strip L99 to the mandatory truths:

1. A creator must be able to **sign in**.
2. A creator must be able to **create a creative profile**.
3. A creator must be able to **start a project**.
4. The **Story Engine must run** and produce usable output.
5. **State must persist** — user leaves, returns, continues same project.
6. **Export or publish** the result.

Everything not required for those six steps is deferred.  
No Bip integration. No generic external-entry contract. No second persona.  
The rule: if removing it does not break the six steps, it is not in V1.

The original five-gate standalone launch plan below remains the durable product baseline. The September 4 federation section adds a proof contract for FCR-to-StoryEngine execution; it does not replace the creator journey or manufacture launch readiness.

---

## FCR -> StoryEngine exact-head federation contract

The bounded FCR -> StoryEngine product-build seam is a separate proof lane from the five advisory L99 launch gates. It exists to prove that founder-authorized FCR execution can reach one exact StoryEngine runtime, perform only the reviewed bounded actuator, and return a receipt that FCR can independently reconcile.

```text
founder-approved FCR decision
-> exact StoryEngine proposal + expected head
-> FCR local peer-contract validation
-> canonical directive JSON at request-body root
-> exact StoryEngine runtime identity
-> StoryEngine independent validation
-> control-room:event-log actuator
-> exact product-build receipt
-> FCR reconciliation
-> exact-head Playwright witness
```

### Mandatory invariants

1. **Exact target identity**: the directive targets project `l99`, repository `jussray/StoryEngine`, and product control room `storyengine-control-room`.
2. **Exact runtime head**: `proposal.expectedHeadSha` is a full Git SHA and must equal the StoryEngine runtime identity immediately before and after execution.
3. **Proof contract**: `requiredProof` must include both `node-test` and `playwright`. FCR rejects a directive that drifts from the peer proof contract before dispatch; StoryEngine validates the same boundary independently.
4. **Bounded capability and mutation**: the federation capability is explicitly allowed and the first actuator is limited to `control-room:event-log`.
5. **Canonical wire shape**: FCR sends the canonical directive object at the HTTP request body root. The stale `{ directive: ... }` wrapper is not part of the contract.
6. **Receipt binding**: the returned `juss-v10/product-build-receipt@v1` receipt must bind to the exact directive and exact repository/control-room identities.
7. **No authority expansion**: merge, deploy, provider mutation, publication, spend, deletion, and destructive authority remain false unless separately granted through their own founder-controlled boundaries.
8. **No blind retry after ambiguity**: when transport outcome is uncertain, do not automatically replay the directive because the bounded actuator may already have executed.
9. **Proof freshness**: a new FCR head, StoryEngine head, runtime identity, contract version, proof set, wire shape, provider context, or browser subject expires predecessor federation proof.
10. **Source is not live proof**: source wiring, a green unit test, or a reachable endpoint does not establish current federation success. Current proof requires the exact FCR head, exact StoryEngine runtime head, valid receipt reconciliation, and the applicable real-path Playwright evidence.

### OODA treatment of federation failures

- **Observe**: identify the first boundary that failed: local contract, transport, peer validator, actuator, receipt, runtime identity, or browser witness.
- **Orient**: classify source defect versus stale proof versus provider/runtime failure. Never patch StoryEngine merely because it correctly rejected a stale FCR client.
- **Decide**: repair the narrowest causal mismatch on the existing carrier.
- **Act**: rerun the exact successor head. Any head movement makes predecessor CI and browser proof historical.

### Red Team / Lindy checks

The federation seam must survive at least these recurring attacks:

- missing `node-test` or `playwright` proof;
- wrong StoryEngine SHA;
- changed runtime SHA during the request;
- nested or otherwise stale wire shape;
- receipt not bound to the exact directive;
- capability or mutation-scope widening;
- transport ambiguity followed by unsafe replay;
- predecessor green inherited after either repository head moves;
- source-green being mislabeled as live runtime success;
- merge/deploy/provider authority leaking from bounded execution.

The Lindy rule is simple: preserve the smallest contract that can still prove the same trustworthy round trip after repeated repository, runner, runtime, and browser changes.

Canonical companion contracts:

- [`REPOSITORY_FEDERATION.md`](REPOSITORY_FEDERATION.md)
- [`PR_CONTINUITY.md`](PR_CONTINUITY.md)

---

## OODA Firing Order — 5 Gates

All five gates are enforced by the Control Room `ProofGate` contract  
(`src/proof-gate/gate.ts`). Gates 2 and 5 require founder `approvedBy`.

| # | Gate ID | Label | Approval? | Lindy test |
|---|---------|-------|-----------|------------|
| 1 | `l99-creator-journey` | Canonical creator journey | No | Would 100 sessions in a row follow this path? |
| 2 | `l99-auth` | Auth + session recovery | **Yes** (`auth-change`) | Can a creator return tomorrow and still be authenticated? |
| 3 | `l99-story-engine` | Story Engine vertical slice | No | Does the output have value on re-use? |
| 4 | `l99-continuity` | Continuity state persistence | No | Is state still correct after 10 leaves and returns? |
| 5 | `l99-release-safety` | Tests, deploy, rollback, cost controls | **Yes** (`deploy`) | Can we recover from a bad deploy without data loss? |

**OODA loop for each gate:**
- **Observe** — run the real path, record what fails.
- **Orient** — classify failure: product blocker / correctness / safety / release / polish.
- **Decide** — pick one blocker; the one that most prevents a creator completing the loop.
- **Act** — ship one vertical slice, rerun the full loop, record proof in `POST /l99/gate/:gateId`.

---

## API Usage

```bash
# 1. Seed L99 into the Control Room registry (idempotent)
curl -X POST http://localhost:8787/l99/seed \
  -H "Authorization: Bearer <founder_token>"

# 2. Check OODA status across all 5 gates
curl http://localhost:8787/l99/status \
  -H "Authorization: Bearer <founder_token>"

# 3. Run a gate — example: gate 1 (evidence only, no approvedBy needed)
curl -X POST http://localhost:8787/l99/gate/l99-creator-journey \
  -H "Authorization: Bearer <founder_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "evidence": {
      "filesChanged": ["app/onboarding/page.tsx", "lib/creator-profile.ts"],
      "behaviorChanged": "Creator can now complete full onboarding to project start",
      "checksRun": ["vitest", "e2e-onboarding-happy-path", "e2e-onboarding-return-user"],
      "failures": [],
      "securityImpact": "none",
      "deploymentImpact": "low",
      "rollbackPath": "revert PR #42 — no DB migrations",
      "unresolvedRisks": []
    }
  }'

# 4. Run gate 2 (auth-change — requires approvedBy)
curl -X POST http://localhost:8787/l99/gate/l99-auth \
  -H "Authorization: Bearer <founder_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvedBy": "founder",
    "evidence": {
      "filesChanged": ["lib/auth.ts", "supabase/migrations/20260713_rls_auth.sql"],
      "behaviorChanged": "Supabase RLS policies enforce authenticated-only access; anon policies removed",
      "checksRun": ["vitest", "rls-policy-audit", "anon-access-regression"],
      "failures": [],
      "securityImpact": "high — closes anonymous-capable policy gap (issue #344)",
      "deploymentImpact": "medium",
      "rollbackPath": "revert migration + redeploy previous edge function",
      "unresolvedRisks": []
    }
  }'
```

---

## Red Team Attacks — Gates Must Survive These

1. **Happy-path lie**: `checksRun: []` → ProofGate rejects. No sneaking through.
2. **No rollback**: `rollbackPath: ''` → ProofGate rejects. Every gate needs escape.
3. **Auth-change without approval**: gate 2 fails without `approvedBy`. No silent auth changes.
4. **Unresolved risks without acknowledgement**: gate fails if `unresolvedRisks.length > 0 && !approvedBy`.
5. **Reporting standalone-ready before all 5 pass**: `GET /l99/status` returns `standaloneLaunchReady: false` and names the blocking gate. No ambiguity.
6. **Bip integration scope creep**: L99 gate IDs contain no Bip references. The control room enforces the boundary.

---

## Lindy Filter — What Survives Long Use

Keep only what is still valuable after 100 creator sessions:
- Creative profile (identity)
- Project persistence (continuity)
- Story Engine run → usable output
- Export / publish
- Auth + safe return state

Cut before V1:
- Se'kret Bip doorway integration
- External-entry contract
- Second creator persona
- Decorative AI orchestration without output
- Any feature that does not advance gate 1–5 proof

---

## Bill Gates Mode — Weekly Review Checklist

Once per week, read `GET /l99/status` and ask:

- [ ] Which gate is the current blocker?
- [ ] Is the team working on the blocker or on something else?
- [ ] Does any new scope pass the Lindy filter?
- [ ] Is there any evidence of Bip integration work slipping in before standalone is proven?
- [ ] Can one creator complete the full loop today, end to end?

If the answer to the last question is yes → move to gate 5 and prepare the release.

---

## Supabase Table Requirement

The `POST /l99/gate/:gateId` endpoint writes to `proof_gate_results`.  
If this table does not exist, add this migration:

```sql
create table if not exists proof_gate_results (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id),
  gate_id       text not null,
  status        text not null check (status in ('pass','fail','skipped')),
  all_failures  text[] not null default '{}',
  evidence      jsonb,
  approved_by   text,
  run_by        text,
  created_at    timestamptz not null default now()
);

create index on proof_gate_results (project_id, gate_id, created_at desc);
```

---

## Firing Order Enforcement Rule

The gates are **advisory-sequential** in the OODA loop — gate 2 should not be
attempted before gate 1 passes, but the API does not hard-block out-of-order
runs. The `GET /l99/status` response surfaces `blockedAt` so the founder can
always see the honest first blocker. Discipline is the founder's job; the
Control Room surfaces truth.
