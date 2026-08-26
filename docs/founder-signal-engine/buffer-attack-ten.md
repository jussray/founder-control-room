# Buffer Publication Attack Ten

Status: `SOURCE_ADVISORY_CONTRACT_IMPLEMENTED__PRODUCTION_AUTHORITY_FAIL_CLOSED`

This is the adversarial evidence contract for consequential social publication through Founder Control Room. It does **not** claim that Buffer, LinkedIn, Cloudflare ingress, or runtime publication is currently proven, and the pure evaluator in this slice cannot authorize a provider mutation.

Machine-readable provider contract: [`config/buffer-provider-contract.json`](../../config/buffer-provider-contract.json)

Executable advisory evaluator: [`tools/zapier/buffer-attack-ten.cjs`](../../tools/zapier/buffer-attack-ten.cjs)

Adversarial source tests: [`tools/zapier/test-buffer-attack-ten.cjs`](../../tools/zapier/test-buffer-attack-ten.cjs)

## Release invariant

A provider `200`, a Buffer schedule, provider acknowledgement, a synthetically valid event chain, or a caller-assembled JSON object is not publication authority.

The standalone Attack Ten evaluator is intentionally **advisory only**:

```text
evaluatePublicationAttackTen(...)
  -> advisory evidence consistency

productionPublicationAllowed(...)
  -> false
```

The machine-readable Attack Ten contract records the same boundary:

```text
scope = advisory-evidence-only
standaloneEvaluatorAuthorizesProduction = false
requiresAuthoritativeProductionAdapter = true
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
| A10 | The hash chain is valid **and each transition is bound to its exact evidence artifact** | A valid state-name chain is reused with unrelated approval, authority, action, readback, or runtime evidence |

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

`INGRESS_INVALID` is intentionally reachable from the live ingress-processing portion of the advisory state machine. A signature or ingress-correlation failure after `ACTION_SUBMITTED`, `PROVIDER_ACKNOWLEDGED`, or `READBACK_CONFIRMED` can therefore remain an explicit red state rather than collapsing into an invalid transition and generic `UNKNOWN`.

The synthetic ledger is append-only and hash-chained. Current state is derived from history. A later event cannot overwrite an earlier event.

### Exact evidence-reference binding

A valid hash chain proves that the event records have not been edited after construction. By itself, it does **not** prove that those events refer to the same evidence evaluated by A1–A9.

For an advisory-green `VERIFIED_PUBLISHED` chain, every transition therefore has a deterministic `evidenceRef` derived from the same exact evidence packet. The refs bind, as applicable, the:

- publication run and content hash;
- founder approval ID;
- review-window maturity evidence;
- authority ID and nonce;
- provider account and channel;
- execution action and persisted reservation;
- provider acknowledgement/action;
- provider readback post ID and LinkedIn URL;
- runtime-observed post ID and LinkedIn URL; and
- final verified run/content/post identity.

A cryptographically valid chain whose `evidenceRef` values are merely non-empty but do not match those exact artifacts fails A10.

## Controlled synthetic proof

The source test may construct a complete synthetic evidence packet to test deterministic behavior. Even when all ten advisory assertions pass:

```text
advisoryAllowed == true
allowed == false
productionAuthority == false
productionPublicationAllowed(...) == false
```

The controlled synthetic run exists to prove the classifier and its negative controls. It is **not** a production-authority source.

This distinction is load-bearing. Synthetic evidence can test the classifier; it cannot create approval, consume authority, reserve an execution, verify a real signature, perform provider readback, or observe public runtime state.

Negative controls include:

1. non-authoritative founder-approval evidence is rejected;
2. premature execution is denied;
3. expired authority is rejected;
4. terminal evidence with unconsumed authority is rejected;
5. action/run authority-consumption mismatch is rejected;
6. mismatched content hash is rejected;
7. arbitrary caller-chosen idempotency keys are rejected;
8. missing persisted-reservation evidence is rejected;
9. cross-run ingress substitution is rejected;
10. caller-declared signer trust is rejected;
11. missing server-verifier or durable-ledger evidence is rejected;
12. missing ingress signer policy fails closed;
13. stale replay evidence is rejected;
14. correlated but non-LinkedIn runtime URLs are rejected;
15. a valid hash chain with mismatched transition evidence references is rejected; and
16. an ingress failure after action submission can be retained explicitly as `INGRESS_INVALID`.

The production wrapper is also regression-tested against a caller-supplied historical evaluation clock. Because `productionPublicationAllowed()` ignores caller input and remains false by construction, a forged test clock cannot turn stale evidence into production authority.

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
exact per-transition evidence-reference bindings
hash-chained publication events
```

No event-supplied `signatureVerified`, `authenticated`, `deduplicated`, `durable`, `storeReadbackVerified`, or similar boolean is production authority by itself.

## Current proof boundary

This branch may prove:

- deterministic Attack Ten advisory evaluation;
- hash-chain tamper detection;
- state-transition validation;
- exact per-transition evidence-reference binding;
- explicit `INGRESS_INVALID` transition behavior during ingress processing;
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
