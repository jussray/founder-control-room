# Founder Proof Audit Lifecycle

Contract: `fcr/founder-proof-audit-lifecycle@v1`

## Purpose

Bind the $99 Founder Proof Audit service to FCR truth semantics without allowing order creation, payment, audit execution, delivery simulation, real delivery, or customer value to collapse into one claim.

## Invariants

1. **Shopify order creation is commerce execution truth, not payment truth.** An observed order advances the current truth plane to `COMMERCE_EXECUTION` while payment remains unverified.
2. **Shopify payment is stronger commerce execution truth only.** A verified payment does not prove that the audit was completed or delivered.
3. **Audit completion is execution truth only.** A completed audit does not prove customer receipt or customer value.
4. **Delivery simulation is not delivery outcome truth.** A dry run may prove that the delivery boundary works, but its highest truth plane remains `AUDIT_EXECUTION` because no customer delivery occurred.
5. **Real delivery requires completed-audit evidence.** `DELIVERED` and `ACKNOWLEDGED` are available only in `LIVE` mode.
6. **Customer acknowledgement is not customer-value proof.** Receipt acknowledgement can advance delivery truth, but customer value and business outcome remain unverified until separately observed.
7. **Dry-run truth cannot impersonate live truth.** `DRY_RUN` requires commerce `NOT_EXECUTED` and may use only simulated delivery.
8. **Evidence/state coherence is fail-closed.** `NOT_EXECUTED`, `MISSING`, `NOT_STARTED`, and `NOT_DELIVERED` states cannot carry stale evidence for the event they say has not occurred. Customer evidence is valid only for `ACKNOWLEDGED` delivery.
9. **Evidence identity is never silently rewritten.** Oversized IDs or evidence references are rejected instead of truncated. Authorized evidence references must be bounded, non-empty, and non-duplicated.
10. **The lifecycle never grants production mutation authority.** A separate authorization reference may be recorded, but `canMutateProduction` remains false. Repairs require a separately authorized execution contract.
11. **No bypass authority.** The lifecycle cannot authorize bypassing access controls or expanding scope.
12. **Bounded intake only.** Intake carries target, objective, and authorized evidence references. Passwords, private keys, recovery codes, raw payment-card data, and other secrets do not belong in this contract.
13. **Runtime enum values fail closed.** Unknown modes, statuses, or commerce sources are rejected rather than silently degraded.
14. **Price, tax, turnaround, refund, and cancellation policy are external business/legal policy gates.** This contract does not invent them.
15. **Historical truth is immutable. Current truth must be re-observed.** Every present-tense claim remains bounded to the evidence plane that actually proved it.

## Truth planes

`INTENT → COMMERCE_EXECUTION → AUDIT_EXECUTION → DELIVERY_OUTCOME`

Within `COMMERCE_EXECUTION`, order creation and payment are distinct claims:

- `commerceExecutionObserved: true` means Shopify order creation or stronger commerce execution was observed.
- `commercePaymentVerified: true` means the stronger payment gate was independently represented by Shopify evidence.
- A live audit may not start from order creation alone.

Delivery simulation is a proof artifact within the dry-run execution slice. It does not advance the lifecycle to `DELIVERY_OUTCOME`.

## Evidence/state coherence

The lifecycle refuses contradictory baggage instead of keeping stale proof around for later accidental reuse:

- `NOT_EXECUTED` commerce requires `evidenceRef: null`.
- `MISSING` intake requires `evidenceRef: null`.
- `NOT_STARTED` audit requires `evidenceRef: null`.
- `NOT_DELIVERED` requires both delivery and customer evidence to be absent.
- `customerEvidenceRef` is accepted only when delivery is `ACKNOWLEDGED`.

Reference length and count limits are validation boundaries, not truncation rules. A reference that exceeds the contract limit is rejected unchanged.

## Dry-run acceptance slice

A valid pre-launch dry run must prove:

- bounded intake validated from authorized evidence,
- no Shopify payment or order execution claimed,
- audit execution completed with evidence,
- delivery boundary simulated with evidence,
- no real customer delivery or acknowledgement claimed,
- no production mutation authority granted.

Expected disposition: `DRY_RUN_VERIFIED`.

Expected highest truth plane: `AUDIT_EXECUTION`.

The receipt may assert `deliverySimulationVerified: true` while `deliveryOutcomeVerified` remains false.

## Live commerce states

### Order created, payment not verified

Expected disposition: `HOLD`.

Expected highest truth plane: `COMMERCE_EXECUTION`.

FCR preserves the order event without inventing payment. Audit execution remains blocked.

### Payment verified

Payment may advance the live audit toward `READY_FOR_AUDIT` only when bounded intake is also validated. Payment alone does not certify audit completion or delivery.

## Live acceptance slice

A live paid audit may begin only after:

- Shopify independently represents payment execution,
- bounded intake is validated,
- FCR preserves audit-execution evidence.

Delivery can become verified only after audit completion and delivery evidence. Customer acknowledgement requires independent customer evidence and still does not prove customer value.

## Next implementation gate

Wire one non-paying internal test case through the lifecycle and preserve its receipt. Do not publish the Shopify service product solely because this source contract exists; publication, payment-account authority, customer-facing policy, runtime, and browser proof remain separate gates.
