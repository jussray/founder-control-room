# Founder Proof Audit Lifecycle

Contract: `fcr/founder-proof-audit-lifecycle@v1`

## Purpose

Bind the $99 Founder Proof Audit service to FCR truth semantics without allowing store identity, order creation, payment, audit execution, delivery simulation, real delivery, or customer value to collapse into one claim.

## Canonical commerce authority

Live Founder Proof Audit commerce is valid only when all three authority coordinates agree:

- project: `founder-control-room`
- branded/custom domain: `foundercontrolroom.org`
- permanent Shopify shop identity: `vercel-store-93a908b0-wcrkkq76.myshopify.com`

A Shopify display name is not authority. A plausible custom domain alone is not authority. A `.myshopify.com` hostname alone is not authority. Live commerce evidence fails closed unless the project, branded domain, and permanent Shopify shop identity match the FCR authority together.

Juss Beautiful Hair is a separate commerce authority. Evidence from `jussbeautifulhair.com` or `8qp1z2-az.myshopify.com` must not satisfy an FCR Founder Proof Audit commerce gate.

## Invariants

1. **Shopify store identity must be proven before Shopify commerce truth is accepted.** `ORDER_CREATED` and `PAYMENT_VERIFIED` require an explicit `storeIdentity` that matches the canonical FCR commerce authority.
2. **Shopify order creation is commerce execution truth, not payment truth.** An observed order advances the current truth plane to `COMMERCE_EXECUTION` while payment remains unverified.
3. **Shopify payment is stronger commerce execution truth only.** A verified payment does not prove that the audit was completed or delivered.
4. **Audit completion is execution truth only.** A completed audit does not prove customer receipt or customer value.
5. **Delivery simulation is not delivery outcome truth.** A dry run may prove that the delivery boundary works, but its highest truth plane remains `AUDIT_EXECUTION` because no customer delivery occurred.
6. **Real delivery requires completed-audit evidence.** `DELIVERED` and `ACKNOWLEDGED` are available only in `LIVE` mode.
7. **Customer acknowledgement is not customer-value proof.** Receipt acknowledgement can advance delivery truth, but customer value and business outcome remain unverified until separately observed.
8. **Dry-run truth cannot impersonate live truth.** `DRY_RUN` requires commerce `NOT_EXECUTED`, source `none`, and no store identity. It may use only simulated delivery.
9. **Evidence/state coherence is fail-closed.** `NOT_EXECUTED`, `MISSING`, `NOT_STARTED`, and `NOT_DELIVERED` states cannot carry stale evidence for the event they say has not occurred. Customer evidence is valid only for `ACKNOWLEDGED` delivery.
10. **Evidence identity is never silently rewritten.** Oversized IDs or evidence references are rejected instead of truncated. Authorized evidence references must be bounded, non-empty, and non-duplicated.
11. **The lifecycle never grants production mutation authority.** A separate authorization reference may be recorded, but `canMutateProduction` remains false. Repairs require a separately authorized execution contract.
12. **No bypass authority.** The lifecycle cannot authorize bypassing access controls or expanding scope.
13. **Bounded intake only.** Intake carries target, objective, and authorized evidence references. Passwords, private keys, recovery codes, raw payment-card data, and other secrets do not belong in this contract.
14. **Runtime enum values fail closed.** Unknown modes, statuses, or commerce sources are rejected rather than silently degraded.
15. **Price, tax, turnaround, refund, and cancellation policy are external business/legal policy gates.** This contract does not invent them.
16. **Historical truth is immutable. Current truth must be re-observed.** Every present-tense claim remains bounded to the evidence plane that actually proved it.

## Truth planes

`INTENT → COMMERCE_EXECUTION → AUDIT_EXECUTION → DELIVERY_OUTCOME`

Within `COMMERCE_EXECUTION`, store authority, order creation, and payment are distinct claims:

- `commerceStoreAuthorityVerified: true` means live Shopify commerce was bound to the canonical FCR project + branded domain + permanent shop identity.
- `commerceExecutionObserved: true` means an FCR-authority Shopify order or stronger commerce execution was observed.
- `commercePaymentVerified: true` means the stronger payment gate was independently represented by Shopify evidence from that same FCR authority.
- A live audit may not start from order creation alone.

Delivery simulation is a proof artifact within the dry-run execution slice. It does not advance the lifecycle to `DELIVERY_OUTCOME`.

## Evidence/state coherence

The lifecycle refuses contradictory baggage instead of keeping stale proof around for later accidental reuse:

- `NOT_EXECUTED` commerce requires `evidenceRef: null` and `storeIdentity: null`.
- live Shopify commerce requires both evidence and the exact FCR store identity tuple.
- `MISSING` intake requires `evidenceRef: null`.
- `NOT_STARTED` audit requires `evidenceRef: null`.
- `NOT_DELIVERED` requires both delivery and customer evidence to be absent.
- `customerEvidenceRef` is accepted only when delivery is `ACKNOWLEDGED`.

Reference length and count limits are validation boundaries, not truncation rules. A reference that exceeds the contract limit is rejected unchanged.

## Dry-run acceptance slice

A valid pre-launch dry run must prove:

- bounded intake validated from authorized evidence,
- no Shopify payment or order execution claimed,
- no Shopify store identity attached to a non-executed commerce state,
- audit execution completed with evidence,
- delivery boundary simulated with evidence,
- no real customer delivery or acknowledgement claimed,
- no production mutation authority granted.

Expected disposition: `DRY_RUN_VERIFIED`.

Expected highest truth plane: `AUDIT_EXECUTION`.

The receipt may assert `deliverySimulationVerified: true` while `deliveryOutcomeVerified` and `commerceStoreAuthorityVerified` remain false.

## Live commerce states

### Wrong or missing Shopify authority

Expected result: fail closed with no commerce truth receipt.

Examples include:

- missing `storeIdentity`,
- project identity other than `founder-control-room`,
- branded domain `jussbeautifulhair.com`,
- permanent shop identity `8qp1z2-az.myshopify.com`,
- any future store that matches only a display name.

### Order created, payment not verified

Expected disposition: `HOLD`.

Expected highest truth plane: `COMMERCE_EXECUTION`.

FCR preserves the order event only after FCR store authority is verified, without inventing payment. Audit execution remains blocked.

### Payment verified

Payment may advance the live audit toward `READY_FOR_AUDIT` only when the payment is from the same verified FCR Shopify authority and bounded intake is also validated. Payment alone does not certify audit completion or delivery.

## Live acceptance slice

A live paid audit may begin only after:

- the canonical FCR Shopify authority tuple is verified,
- Shopify independently represents payment execution from that authority,
- bounded intake is validated,
- FCR preserves audit-execution evidence.

Delivery can become verified only after audit completion and delivery evidence. Customer acknowledgement requires independent customer evidence and still does not prove customer value.

## Current implementation gate

The non-paying internal dry-run service already exercises the lifecycle without Shopify mutation. The next legitimate live-commerce gate is an exact-runtime observation that binds a real FCR Shopify event to the canonical store identity tuple before any paid audit execution is recognized.

Do not publish or promote the Shopify service product solely because this source contract exists. Publication, payment-account authority, customer-facing policy, exact-runtime execution, and browser proof remain separate gates.
