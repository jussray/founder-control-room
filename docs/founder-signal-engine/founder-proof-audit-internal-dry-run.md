# Founder Proof Audit Internal Dry Run

Contract: `fcr/founder-proof-audit-internal-dry-run@v1`

## Purpose

Exercise `fcr/founder-proof-audit-lifecycle@v1` through an FCR runtime service boundary and preserve one deterministic receipt without creating a Shopify order, charging a payment, contacting a customer, or mutating the audited target.

This is an **internal callable service**, not a public purchase endpoint and not a customer audit API.

## Exact-runtime binding

The dry run requires an exact 40-character runtime Git SHA. The normalized SHA determines:

- the internal audit ID,
- all server-generated lifecycle evidence references,
- the deterministic source event ID,
- the input fingerprint.

Missing or malformed runtime identity fails closed.

## No caller-supplied proof

The service does not accept customer evidence, Shopify evidence, target URLs, objectives, delivery acknowledgements, or mutation authorization as caller input. The internal case is constructed by FCR itself so a caller cannot turn arbitrary strings into a verified lifecycle receipt.

## Truth boundaries

The generated lifecycle receipt must remain:

- `mode: DRY_RUN`,
- `disposition: DRY_RUN_VERIFIED`,
- highest truth plane `AUDIT_EXECUTION`,
- `commerceExecutionObserved: false`,
- `commercePaymentVerified: false`,
- `auditExecutionVerified: true`,
- `deliverySimulationVerified: true`,
- `deliveryOutcomeVerified: false`,
- `customerReceiptAcknowledged: false`,
- `customerValueOutcomeVerified: false`.

Any drift from those invariants aborts before persistence.

## Persistence boundary

The default store resolves the active `founder-control-room` project and writes one event to the existing `project_events` ledger.

Event type: `founder_proof_audit_dry_run_receipt`.

The deterministic source event ID is bound to the contract plus exact runtime SHA. A unique-key collision is read back:

- same minimized metadata → `duplicate`,
- different metadata → `conflict`.

Neither condition is silently rewritten as a fresh success.

## Data minimization

Persisted metadata contains only:

- internal dry-run contract,
- exact runtime SHA,
- fixed test-case name,
- SHA-256 input fingerprint,
- minimized lifecycle receipt,
- explicit no-commerce/no-customer/no-target-mutation guarantees.

Raw lifecycle evidence references, target refs, and objectives are not persisted by this service.

## Authority

The only write this service is designed to perform is the FCR receipt-ledger insert itself. It does not grant or exercise mutation authority against the audited target, Shopify, a customer system, a repository, or a deployment provider.

## Current truth gate

Source implementation and tests can prove that this runtime service is correctly wired in code. They do **not** prove that a deployed FCR runtime has executed and persisted the receipt.

A deployed-runtime claim requires a later exact-SHA invocation and provider/database readback of the stored event. Until then, keep runtime outcome **UNPROVEN**.
