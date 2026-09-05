# Founder Proof Audit Lifecycle

Contract: `fcr/founder-proof-audit-lifecycle@v1`

## Purpose

Bind the $99 Founder Proof Audit service to FCR truth semantics without allowing commerce execution, audit execution, delivery simulation, real delivery, or customer value to collapse into one claim.

## Invariants

1. **Shopify payment is commerce execution truth only.** A paid order does not prove that the audit was completed or delivered.
2. **Audit completion is execution truth only.** A completed audit does not prove customer receipt or customer value.
3. **Delivery simulation is not delivery outcome truth.** A dry run may prove that the delivery boundary works, but its highest truth plane remains `AUDIT_EXECUTION` because no customer delivery occurred.
4. **Real delivery requires completed-audit evidence.** `DELIVERED` and `ACKNOWLEDGED` are available only in `LIVE` mode.
5. **Customer acknowledgement is not customer-value proof.** Receipt acknowledgement can advance delivery truth, but customer value and business outcome remain unverified until separately observed.
6. **Dry-run truth cannot impersonate live truth.** `DRY_RUN` requires commerce `NOT_EXECUTED` and may use only simulated delivery.
7. **The lifecycle never grants production mutation authority.** A separate authorization reference may be recorded, but `canMutateProduction` remains false. Repairs require a separately authorized execution contract.
8. **No bypass authority.** The lifecycle cannot authorize bypassing access controls or expanding scope.
9. **Bounded intake only.** Intake carries target, objective, and authorized evidence references. Passwords, private keys, recovery codes, raw payment-card data, and other secrets do not belong in this contract.
10. **Runtime enum values fail closed.** Unknown modes, statuses, or commerce sources are rejected rather than silently degraded.
11. **Price, tax, turnaround, refund, and cancellation policy are external business/legal policy gates.** This contract does not invent them.
12. **Historical truth is immutable. Current truth must be re-observed.** Every present-tense claim remains bounded to the evidence plane that actually proved it.

## Truth planes

`INTENT → COMMERCE_EXECUTION → AUDIT_EXECUTION → DELIVERY_OUTCOME`

Delivery simulation is a proof artifact within the dry-run execution slice. It does not advance the lifecycle to `DELIVERY_OUTCOME`.

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

## Live acceptance slice

A live paid audit may begin only after:

- Shopify independently verifies payment execution,
- bounded intake is validated,
- FCR preserves audit-execution evidence.

Delivery can become verified only after audit completion and delivery evidence. Customer acknowledgement requires independent customer evidence and still does not prove customer value.

## Next implementation gate

Wire one non-paying internal test case through the lifecycle and preserve its receipt. Do not publish the Shopify service product solely because this source contract exists; publication, payment-account authority, customer-facing policy, runtime, and browser proof remain separate gates.
