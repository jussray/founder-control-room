# Founder Proof Audit Lifecycle

Contract: `fcr/founder-proof-audit-lifecycle@v1`

## Purpose

Bind the $99 Founder Proof Audit service to FCR truth semantics without allowing commerce execution, audit execution, delivery, or customer value to collapse into one claim.

## Invariants

1. **Shopify payment is commerce execution truth only.** A paid order does not prove that the audit was completed or delivered.
2. **Audit completion is execution truth only.** A completed audit does not prove customer receipt or customer value.
3. **Delivery requires completed-audit evidence.** Real delivery states are available only in `LIVE` mode.
4. **Customer acknowledgement is not customer-value proof.** Receipt acknowledgement can advance delivery truth, but customer value and business outcome remain unverified until separately observed.
5. **Dry-run truth cannot impersonate live truth.** `DRY_RUN` requires commerce `NOT_EXECUTED` and may use only simulated delivery.
6. **The lifecycle never grants production mutation authority.** A separate authorization reference may be recorded, but `canMutateProduction` remains false. Repairs require a separately authorized execution contract.
7. **No bypass authority.** The lifecycle cannot authorize bypassing access controls or expanding scope.
8. **Bounded intake only.** Intake carries target, objective, and authorized evidence references. Passwords, private keys, recovery codes, raw payment-card data, and other secrets do not belong in this contract.
9. **Price, tax, turnaround, refund, and cancellation policy are external business/legal policy gates.** This contract does not invent them.
10. **Historical truth is immutable. Current truth must be re-observed.** Every present-tense claim remains bounded to the evidence plane that actually proved it.

## Truth planes

`INTENT → COMMERCE_EXECUTION → AUDIT_EXECUTION → DELIVERY_OUTCOME`

Advancing a plane does not erase or upgrade the meaning of earlier evidence.

## Dry-run acceptance slice

A valid pre-launch dry run must prove:

- bounded intake validated from authorized evidence,
- no Shopify payment or order execution claimed,
- audit execution completed with evidence,
- delivery boundary simulated with evidence,
- no real customer delivery or acknowledgement claimed,
- no production mutation authority granted.

Expected disposition: `DRY_RUN_VERIFIED`.

## Live acceptance slice

A live paid audit may begin only after:

- Shopify independently verifies payment execution,
- bounded intake is validated,
- FCR preserves audit-execution evidence.

Delivery can become verified only after audit completion and delivery evidence. Customer acknowledgement requires independent customer evidence and still does not prove customer value.

## Next implementation gate

Wire one non-paying internal test case through the lifecycle and preserve its receipt. Do not publish the Shopify service product solely because this source contract exists; publication, payment-account authority, customer-facing policy, runtime, and browser proof remain separate gates.
