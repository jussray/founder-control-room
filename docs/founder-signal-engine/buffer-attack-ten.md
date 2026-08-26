# Buffer Publication Attack Ten

Status: `SOURCE_ADVISORY_CONTRACT_IMPLEMENTED__PRODUCTION_AUTHORITY_FAIL_CLOSED`

This is the adversarial evidence contract for consequential social publication through Founder Control Room. It does **not** claim that Buffer, LinkedIn, Cloudflare ingress, or runtime publication is currently proven, and the pure evaluator in this slice cannot authorize a provider mutation.

Machine-readable provider contract: [`config/buffer-provider-contract.json`](../../config/buffer-provider-contract.json)

Executable advisory evaluator: [`tools/zapier/buffer-attack-ten.cjs`](../../tools/zapier/buffer-attack-ten.cjs)

Adversarial source tests: [`tools/zapier/test-buffer-attack-ten.cjs`](../../tools/zapier/test-buffer-attack-ten.cjs)

## Release invariant

A provider `200`, a Buffer schedule, provider acknowledgement, or a caller-assembled JSON object is not publication authority.

The standalone Attack Ten evaluator is intentionally **advisory only**:

```text
evaluatePublicationAttackTen(...)
  -> advisory evidence consistency

productionPublicationAllowed(...)
  -> false
```

That fail-closed boundary remains until a separately integrated production adapter owns the authoritative actions that a pure function cannot prove:

1. authenticated founder approval readback from the FCR-owned approval store;
2. atomic approval/authority claim and one-use consumption;
3. deterministic idempotency derived by the control plane and persisted in the execution ledger;
4. cryptographic ingress signature verification and durable event-ledger readback;
5. provider-native readback for the exact LinkedIn destination; and
6. public runtime observation for the same post identity and URL.

Current `main` already contains founder-content orchestration primitives that derive an orchestration identity, require a server-authenticated founder identity, reserve `approval_executions`, block duplicate/cross-scope reuse, and treat scheduling as pending provider readback. This Attack Ten slice does not duplicate or bypass those owners.

## Attack Ten

| ID | Advisory assertion | Failure the contract must expose |
| --- | --- | --- |
| A1 | Founder approval evidence is exact and store-bound | Caller JSON is mistaken for authoritative approval |
| A2 | Authority evidence is scoped, expiring, and consumed exactly once by this action | Unused/replayed/cross-run authority is treated as terminal proof |
| A3 | Review-window rules are control-plane enforced | Provider or caller bypasses the review policy |
| A4 | Content identity is frozen and integrity-bound | Approval, execution, readback, or runtime refers to different copy |
| A5 | Provider capability evidence is live and policy-gated | Configuration or a mock is promoted into live capability |
| A6 | Execution evidence uses a derived idempotency key and persisted reservation | Caller-chosen keys or booleans manufacture retry safety |
| A7 | Provider acknowledgement is independently read back on LinkedIn | Submission success or a wrong destination becomes provider truth |
| A8 | Ingress evidence names a server-side cryptographic verifier and durable ledger readback | Signature/dedupe/durability booleans self-certify forged ingress |
| A9 | Runtime outcome is observed on the exact approved LinkedIn destination | Matching wrong URLs become `VERIFIED_PUBLISHED` |
| A10 | Failure, expiry, denial, and rollback stay visible and safe | Missing evidence or a red path silently resolves to green |

## Canonical evidence state machine

```text
DRAFT
  -> FOUNDER_APPROVED
  -> REVIEW_WINDOW_OPEN
  -> REVIEW_WINDOW_MATURED
  -> AUTHORITY_MINTED
  -> PROVIDER_CAPABILITY_VERIFIED
  -> ACTION_SUBMITTED
  -> PROVIDER_ACKNOWLEDGED
  -> READBACK_CONFIRMED
  -> RUNTIME_OUTCOME_OBSERVED
  -> VERIFIED_PUBLISHED
```

Red and recoverable states remain explicit:

```text
DENIED
EXPIRED
REVOKED
FAILED
UNKNOWN
CORRELATION_FAILED
INGRESS_INVALID
DUPLICATE_BLOCKED
ROLLBACK_PENDING
ROLLED_BACK
```

The synthetic ledger is append-only and hash-chained. Current state is derived from history. A later event cannot overwrite an earlier event.

## Controlled synthetic proof

The source test may construct a complete synthetic evidence packet to test deterministic behavior. Even when all ten advisory assertions pass:

```text
advisoryAllowed == true
allowed == false
productionAuthority == false
productionPublicationAllowed(...) == false
```

This distinction is load-bearing. Synthetic evidence can test the classifier; it cannot create approval, consume authority, reserve an execution, verify a real signature, perform provider readback, or observe public runtime state.

Negative controls include:

1. non-authoritative founder-approval evidence is rejected;
2. premature execution is denied;
3. expired or unconsumed authority is rejected;
4. action/run authority consumption mismatch is rejected;
5. mismatched content hash is rejected;
6. arbitrary caller-chosen idempotency keys are rejected;
7. missing persisted-reservation evidence is rejected;
8. cross-run ingress substitution is rejected;
9. caller-declared signer trust is rejected;
10. missing server-verifier/ledger evidence is rejected;
11. stale replay evidence is rejected; and
12. correlated but non-LinkedIn runtime URLs are rejected.

## Evidence required from a future authoritative adapter

A real release proof must retain provider/server-owned evidence for:

```text
publication_run_id
canonical_payload_sha256
founder_approval_id + authoritative store readback
authority_id + nonce
authority consumed_at + exact action/run correlation
provider account + LinkedIn channel identity
control-plane-derived idempotency key
persisted execution reservation identity
provider action ID
cryptographically verified ingress evidence
trusted signer policy identity
durable ingress ledger readback
provider-native LinkedIn post readback
public LinkedIn runtime observation
hash-chained publication events
```

No event-supplied `signatureVerified`, `authenticated`, `deduplicated`, `durable`, `storeReadbackVerified`, or similar boolean is production authority by itself.

## Current proof boundary

This branch may prove:

- deterministic Attack Ten advisory evaluation;
- hash-chain tamper detection;
- state-transition validation;
- exact content/run/action correlation;
- derived advisory idempotency;
- explicit terminal authority-consumption evidence shape;
- LinkedIn destination binding;
- negative-control behavior; and
- that the standalone evaluator cannot authorize production.

It does not prove:

- authenticated approval-store readback or atomic approval claim;
- live Buffer credentials/scopes or account/channel mapping;
- live Buffer mutation;
- real authority/nonce consumption;
- live private ingress delivery;
- cryptographic signature verification;
- durable production ingress ledger readback;
- LinkedIn publication;
- public runtime rendering; or
- production rollback.

Those remain separate authoritative provider/runtime evidence gates.

## Rollback

Revert this focused Attack Ten slice. No Buffer, LinkedIn, database, credential, or production publication mutation is performed by this source contract.
