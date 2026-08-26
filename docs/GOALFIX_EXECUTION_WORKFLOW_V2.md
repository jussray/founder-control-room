# Goalfix Execution Workflow v2

Status: `IMPLEMENTED_SOURCE_CONTRACT / LIVE_OUTCOME_UNVERIFIED`

This is the repository-owned execution workflow used when a founder goal advances beyond Goalfix v1 inspection into approved implementation.

It does not widen `goalfix-v1` read-only authority. Inspection remains read-only until the founder or checked-in policy grants a bounded mutation. This v2 contract governs what happens after that gate.

## Canonical lane

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
FOUNDER MERGE DECISION
  ↓
MERGE WITH EXPECTED HEAD
  ↓
REACQUIRE MAIN
  ↓
POST-MERGE / RUNTIME TRUTH
  ↓
COMPLETE
```

The executable contract lives in `src/goalfix/executionWorkflow.ts`.

## Strategy stack

### Art of War

Use strategy to reduce unnecessary exposure and wasted motion, not to enlarge the patch.

```text
Know the ground before movement
= identify authoritative repo, branch, exact base SHA, runtime, and provider boundary.

Win before fighting
= define authority, stop condition, rollback, proof plan, and smallest reversible fix before mutation.

Avoid unnecessary siege
= do not brute-force broad refactors when a narrow verified path exists.

Use existing asymmetry
= reuse existing trusted provider/read-only paths, tests, receipts, service bindings, and verified infrastructure instead of inventing a new trust path.

Preserve future options
= keep changes reversible and do not destroy old evidence before residue is reconciled.
```

### Lindy Mode

Prefer fixes that remain legible and defensible later:

- smallest durable contract;
- reversible before clever;
- no temporary green theater;
- no hidden fallback that weakens the intended invariant.

### L99

Every consequential step must make these explicit:

```text
AUTHORITY
STATE
EVIDENCE
ROLLBACK
COMPOUNDING VALUE
```

### OODA

```text
Observe → Orient → Decide → Act → Verify → Loop
```

`ULTRATHINK` means deeper causal reasoning, not a larger diff.

## Role membrane

The workflow refuses self-certification.

```text
Founder
  owns consequential merge/release authority

Builder
  implements the smallest approved change

Verifier
  independently proves the exact candidate path

Red Team / Devil
  independently attacks assumptions, bypasses, stale evidence, and blast radius
```

The same actor may not be Builder and Verifier, Builder and Red Team, or Verifier and Red Team for the load-bearing checkpoints.

## Fingerprint binding

Every load-bearing checkpoint binds to the exact technical state it observed.

At minimum:

```text
repository
base SHA
candidate head SHA
diff fingerprint
required dependency fingerprints
evidence IDs
```

The source binding is SHA-256 derived from repository + exact candidate head. A PASS checkpoint with a different source fingerprint is `UNVERIFIED`.

If `main` moves after verification:

```text
prior proof
→ historical provenance
→ REVERIFY_REQUIRED
```

No prior green is inherited into the new merge base.

## Proof-cookie binding

The workflow reuses ATTACK-20 V3 `ProofBinding` cookie contracts for provenance continuity.

```text
Founder-session cookie
  ↓
Builder-run cookie
  ↓
Verification-run cookie
  ↓
Provider-run cookie
  ↓
Post-merge/runtime receipt
```

These are internal provenance records only.

```text
proof cookie
≠ HTTP/browser cookie
≠ auth token
≠ bearer credential
≠ secret
≠ tracking identifier
```

Expired, revoked, cyclic, detached, or unknown-parent proof cookies invalidate the affected checkpoint to `UNVERIFIED`.

## Merge-liveness rule

Pre-merge proof is valid only for the candidate and base it observed.

```text
candidate head H
verified against base B
current main still B
founder approval bound to H + diff fingerprint
  ↓
READY_TO_MERGE
```

If current main is no longer B:

```text
REVERIFY_REQUIRED
```

The focused change must be reacquired on current main, its diff fingerprint recomputed, and Verifier + Red Team rerun.

## Founder decision rule

Machine green is not merge authority.

A founder merge decision must bind to:

- exact candidate head SHA;
- exact diff fingerprint;
- declared decision ID;
- founder-session proof cookie;
- current provenance lineage.

A stale approval cannot authorize a newer head or altered diff.

## Post-merge rule

Merge is not completion.

After merge:

1. reacquire current `main`;
2. prove the merged identity;
3. run required provider/runtime/browser proof;
4. correlate runtime receipts;
5. only then resolve `COMPLETE`.

When runtime proof is required and missing:

```text
MERGED_UNVERIFIED
```

For UI/runtime work, Playwright remains required before claiming the path done.

## Exact report

Every execution loop returns:

```text
REALITY
FIX
PROOF
RISK
ROLLBACK
NEXT GATE
```

`REALITY` must distinguish VERIFIED, INFERRED, UNKNOWN, BLOCKED, and STALE where relevant.

## ATTACK-20 integration

ATTACK-20 V3 and Goalfix v2 share the same proof-binding idea:

```text
technical fingerprint
+
declared continuity/provenance cookie
=
load-bearing proof binding
```

ATTACK-20 answers whether security claims are current. Goalfix v2 answers whether implementation and merge decisions are current. Neither may convert missing evidence into green.

## Rollback

Before merge: close the focused PR or reset the branch to its verified base.

After merge: revert the focused commit or merge commit using the repository's normal authority lane, then reacquire main and rerun affected verification/runtime proof.

Preserve failed receipts, stale fingerprints, red-team findings, and superseded PRs as historical provenance until their unique residue is reconciled.
