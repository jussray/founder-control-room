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
| A1 | Founder approval evidence claim is internally correlated | Caller JSON is mistaken for authoritative store proof |
| A2 | Authority-consumption evidence claim is exact and one-use | Unused/replayed/cross-run authority is treated as terminal proof |
| A3 | The full 20-minute review window is represented and enforced | `maturedAt` is asserted immediately without 20 minutes elapsing |
| A4 | The actual canonical LinkedIn payload is hashed and correlated | Metadata hashes stay approved while the actual text/channel changes |
| A5 | Provider-capability evidence claim is internally correlated | Configuration or a mock is promoted into provider proof |
| A6 | The idempotency key is derived and reservation evidence is correlated | Caller-chosen keys or booleans manufacture retry safety |
| A7 | Provider-readback evidence claim is LinkedIn-bound | Submission success or a wrong destination becomes provider truth |
| A8 | Ingress-verification evidence claim is correlated and replay-bounded | Signature/dedupe/durability booleans self-certify forged ingress |
| A9 | Runtime evidence claim is bound to the exact LinkedIn destination | Matching wrong URLs become `VERIFIED_PUBLISHED` |
| A10 | Event history is non-future, hash-valid, and bound to exact evidence | Future events or a valid state-name chain with unrelated evidence become advisory-green |

The word **claim** is deliberate. A pure evaluator can validate the internal shape and correlation of supplied evidence. It cannot itself prove a database read, atomic reservation, cryptographic signature verification, provider-native readback, or public runtime observation. Those remain responsibilities of the future authoritative production adapter.

## Canonical payload

A4 receives the actual publication artifact and hashes the canonical shape:

```text
{
  platform: "linkedin",
  channelId: <exact approved LinkedIn channel>,
  text: <exact approved post text>
}
```

The evaluator computes the SHA-256 of that canonical payload itself. The resulting digest must equal `contentSha256`, and the approval, authority, execution, provider-readback, and runtime metadata hashes must all equal the same digest.

Changing the text or channel while retaining the old metadata hash therefore fails A4.

This proves internal payload/hash consistency only. The authoritative adapter must still prove that the canonical payload came from the exact approved FCR artifact.

## Review-window evidence

The Buffer review policy is fixed at 20 minutes and starts from `generatedAt`.

A3 requires:

```text
policyId == buffer-20-minute-review-v1
generatedAt is valid
maturedAt is valid
maturedAt - generatedAt >= 20 minutes
maturedAt <= evaluation time
authority.notBefore >= maturedAt
providerOverrideAllowed == false
```

A caller cannot set `maturedAt` to the current instant and immediately claim the review window completed.

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

`INGRESS_INVALID` is intentionally reachable from the ingress-processing portion of the advisory state machine. A signature or ingress-correlation failure after `ACTION_SUBMITTED`, `PROVIDER_ACKNOWLEDGED`, or `READBACK_CONFIRMED` can therefore remain an explicit red state rather than collapsing into an invalid transition and generic `UNKNOWN`.

The synthetic ledger is append-only and hash-chained. Current state is derived from history. A later event cannot overwrite an earlier event.

### Evaluation-time boundary

Hash validity and monotonic ordering do not make a future event real.

A10 requires every event `occurredAt` to be at or before the evaluation boundary used for the advisory pass. A perfectly hash-valid chain dated after that boundary therefore fails advisory green.

The production wrapper remains hard-false and ignores caller-supplied clocks. A deterministic `nowMs` exists only to test the advisory evaluator.

### Exact evidence-reference binding

A valid hash chain proves that the event records have not been edited after construction. By itself, it does **not** prove that those events refer to the same evidence evaluated by A1–A9.

For an advisory-green `VERIFIED_PUBLISHED` chain, every transition therefore has a deterministic `evidenceRef` derived from the same exact evidence packet. The refs bind, as applicable, the:

- publication run and canonical payload hash;
- founder approval ID;
- review-window generated/maturity evidence;
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

Synthetic evidence can test the classifier; it cannot create approval, consume authority, reserve an execution, verify a real signature, perform provider readback, or observe public runtime state.

Negative controls include:

1. non-authoritative founder-approval evidence is rejected as authoritative proof;
2. premature execution is denied;
3. a shortened review window is rejected;
4. expired authority is rejected;
5. terminal evidence with unconsumed authority is rejected;
6. action/run authority-consumption mismatch is rejected;
7. mutation of the actual canonical publication payload is rejected even when metadata hashes remain unchanged;
8. mismatched content hashes are rejected;
9. arbitrary caller-chosen idempotency keys are rejected;
10. missing persisted-reservation evidence is rejected;
11. cross-run ingress substitution is rejected;
12. caller-declared signer trust is rejected;
13. missing server-verifier or durable-ledger evidence is rejected;
14. missing ingress signer policy fails closed;
15. stale replay evidence is rejected;
16. correlated but non-LinkedIn runtime URLs are rejected;
17. a valid hash chain with mismatched transition evidence references is rejected;
18. future-dated but hash-valid publication events are rejected; and
19. an ingress failure after action submission can be retained explicitly as `INGRESS_INVALID`.

The production wrapper is also regression-tested against a caller-supplied historical evaluation clock. Because `productionPublicationAllowed()` ignores caller input and remains false by construction, a forged test clock cannot turn stale evidence into production authority.

## Evidence required from a future authoritative adapter

A real release proof must retain provider/server-owned evidence for:

```text
publication_run_id
canonical publication payload artifact
canonical_payload_sha256
founder_approval_id + authoritative store readback
review generated_at + matured_at
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
event occurred_at values bounded by observation time
hash-chained publication events
```

No event-supplied `signatureVerified`, `authenticated`, `deduplicated`, `durable`, `storeReadbackVerified`, or similar boolean is production authority by itself.

## Current proof boundary

This branch may prove:

- deterministic Attack Ten advisory evaluation;
- actual canonical-payload hashing and mutation detection;
- full 20-minute review-window arithmetic;
- rejection of future-dated evidence at the advisory evaluation boundary;
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
