# Revenue Proof OS V1

Status: source contract on the existing Founder Control Room sales carrier.

This contract does not create a new authority system. It composes the existing `/sales`, Founder AI Operator Workflow, Unified Growth Inbox, `/devil`, L99, OODA, operator continuity, provider readback, and founder approval boundaries into one end-to-end revenue operating sequence.

## Governing law

Revenue work moves only when current evidence supports the next truth plane.

```text
founder intent
-> market evidence
-> buyer identity
-> qualification evidence
-> authorized engagement
-> provider receipt
-> commercial commitment
-> provider-native cash evidence
-> delivery evidence
-> independently verified customer outcome
-> retention / expansion learning
```

No state authorizes the next. Historical proof remains historical. Current truth must be re-observed.

## Six truth planes

### 1. DISCOVER

Purpose: establish a current market/ICP/account/decision-maker hypothesis without inventing demand.

Required truth:
- market evidence and freshness;
- ICP hypothesis and disqualifiers;
- account identity;
- likely problem owner and decision-maker path;
- source/provenance coverage.

Discovery never authorizes contact.

### 2. QUALIFY

Purpose: establish whether a real buyer problem is worth pursuing.

Required truth:
- verified problem or explicit current need;
- problem owner;
- decision authority or decision path;
- timing/urgency;
- plausible economics and budget/resource path;
- capability fit;
- disqualifiers and kill conditions.

A reply, click, booked meeting, introduction, or CRM stage is not qualification by itself.

### 3. ENGAGE

Purpose: create one bounded, truthful external contact under exact founder authority.

Required sequence:

```text
buyer + recipient identity
-> offer/message fingerprint
-> duplicate pre-send guard
-> exact founder approval
-> one-shot execution lease
-> one provider mutation maximum
-> provider receipt
-> send lease consumed
-> read-only destination/provider verification
-> close write phase
```

One founder approval authorizes at most one external send to one approved prospect with one approved message/version in that run.

The first provider response containing a message ID, thread ID, SENT label, or equivalent success receipt consumes the lease. After consumption, every further write action for that prospect is forbidden for the rest of the run. Verification must use read-only search/read/list/get operations only.

If verification is unavailable, delayed, ambiguous, contradictory, or fails, classify delivery `UNKNOWN/HOLD` and stop. Never retry merely to obtain proof. A missing readback is safer than a duplicate send.

### 4. CLOSE

Purpose: convert verified buyer interest into a binding, economically sound commercial commitment.

Required sequence:

```text
engaged buyer
-> qualification evidence
-> objection evidence
-> proposal-ready scope
-> exact pricing/discount authority
-> proposal sent
-> negotiation
-> binding signature/acceptance
-> invoice
-> provider-native cash receipt
```

Truth boundaries:
- proposal != contract;
- verbal yes != signed commitment;
- signed contract != invoice;
- invoice != cash;
- cash != fulfilled delivery;
- cash != customer value.

### 5. DELIVER

Purpose: fulfill exactly the sold scope and prove what actually happened.

Required model:

```text
intent
-> scoped authority
-> execution
-> execution evidence
-> independent outcome evidence
```

Provider success, tool success, HTTP 2xx, workflow completion, deployment receipt, order creation, or audit-log entry may prove execution. None proves the intended business/customer outcome unless the outcome is independently observed.

Delivery claims must preserve scope, proof provenance, rollback/correction path, and customer evidence boundaries.

### 6. COMPOUND

Purpose: turn verified customer value into durable learning rather than vanity metrics.

Required sequence:

```text
customer outcome verified
-> retention signal
-> renewal / expansion evidence
-> verified case-study evidence
-> learning patch
-> updated ICP / offer / qualification rules
```

Never convert opens, clicks, replies, sends, raw usage, cash collection, or internal completion into a public customer-success claim without stronger evidence and publication authority.

## Revenue truth state machine

Use the existing `/sales` state machine unchanged:

```text
IDENTIFIED
-> CONTACTABLE
-> ENGAGED
-> QUALIFIED
-> PROPOSAL_READY
-> PROPOSAL_SENT
-> NEGOTIATING
-> SIGNED
-> INVOICED
-> CASH_COLLECTED
-> FULFILLED
-> CUSTOMER_VALUE_VERIFIED
```

A state may regress when evidence becomes stale, contradicted, revoked, disputed, unpaid, refunded, superseded, or misattributed.

Keep these headline planes separate:

```text
cash_collected
signed_contract_value
qualified_pipeline
speculative_opportunity
```

Borrowing, financing, grants, investment proceeds, unpaid invoices, unsigned proposals, and speculative gains are not revenue.

## Attack 2000

Attack 2000 is exactly two independent Attack-1000 passes.

### Pass I — premise / market / fit attack

Run before target selection or outreach.

```text
10 truth domains
x 10 failure modes
x 10 adversary lenses
= 1,000 probes
```

Pass I attacks buyer/problem reality, demand/timing, fit, economics, proof, authority, channel, fulfillment, contract/payment plausibility, attribution, and freshness before a prospect is promoted into an actionable target.

### Pass II — exact-plan attack

Run against the exact selected target and consequential transition.

The subject includes the exact prospect, channel, message/offer, authority state, send lease, pricing/proposal/contract/payment plan, delivery promise, or customer-outcome claim being considered.

Use the same 10 x 10 x 10 matrix for another 1,000 probes.

Each material non-pass finding is classified:
- `CONTROL`: proceed only with the stated control;
- `HOLD`: do not promote until the smallest missing evidence/control is obtained;
- `KILL`: retire the action/plan unless the underlying premise materially changes.

A material unresolved `HOLD` or any `KILL` blocks the next consequential state transition.

## Attack matrix

Truth domains:
1. buyer/problem;
2. demand/timing;
3. offer/scope;
4. pricing/economics;
5. proof/claims;
6. authority/consent/legal boundary;
7. channel/deliverability;
8. fulfillment/capacity;
9. contract/payment/collection;
10. CRM/attribution/freshness.

Failure modes:
1. stale state;
2. wrong identity/authority;
3. missing evidence;
4. incentive/metric gaming;
5. duplicate/double-count;
6. partial failure;
7. provider/channel/policy drift;
8. unauthorized scope expansion;
9. rollback failure/lock-in;
10. fraud/dispute/reputation harm.

Adversary lenses:
1. buyer;
2. procurement/legal;
3. finance;
4. security/privacy;
5. fulfillment operator;
6. competitor;
7. channel/provider;
8. FutureYou/maintenance;
9. recovery operator;
10. public/reputation reviewer.

## Fingerprints and continuity cookies

Reuse `juss-v10/operator-continuity@v2` and the existing deterministic fingerprint semantics. Do not create a second authority system.

At meaningful transitions bind minimized deterministic fingerprints for:
- market/ICP state;
- prospect identity;
- recipient/channel;
- offer/message version;
- deduplicated pipeline state;
- proof state;
- source/tool coverage;
- founder authority state;
- send-lease state;
- contract/payment state;
- delivery state;
- customer-value state.

Continuity is audit metadata only:

```text
browserCookie: false
authorizing: false
standingMergeAuthority: false
approvalCarryForward: false
founderDecisionRequired: true
```

Expire current revenue continuity no later than 24 hours after observation and immediately when buyer reply, deal state, price, proof subject, provider state, contract/payment state, delivery state, customer-value evidence, or authority changes.

Never place raw message bodies, raw email addresses/phone numbers, payment credentials, secrets, teen/family/private content, or chain-of-thought inside the fingerprint/cookie payload.

## Tool/source roles

- GitHub: exact product/source proof. Source green is not runtime or customer outcome.
- Gmail: current outreach, buyer replies, requests, and provider sent-state evidence.
- HubSpot: CRM state, association, amount, stage, activity, and dedup evidence. CRM state is not cash.
- LinkedIn/public web: professional/account discovery and public qualification evidence only within supported capabilities.
- Stripe/Shopify/payment providers: provider-native payment truth when applicable.
- Drive/Docs/Sheets/Slides: approved proposals, proof packets, pricing sources, and durable operating records.
- n8n/Zapier/automations: bounded execution/observation only. A workflow receipt proves execution, not revenue or customer value.

Missing source coverage is `UNKNOWN`, never `nothing exists`.

## Authority separation

Keep these gates independent:
- outreach;
- pricing;
- discount;
- proposal publication;
- contract acceptance/signature;
- payment/charge/refund;
- delivery;
- production/provider mutation;
- case-study/publication;
- customer-value certification.

No workflow name, fingerprint, cookie, prior approval, CRM stage, provider receipt, or previous successful run can silently grant the next authority.

## Kill rules

Stop or downgrade when:
- buyer/problem evidence is absent or stale;
- identity, consent, or decision authority is ambiguous;
- the plan requires deception, spam, fabricated urgency/scarcity, predatory pressure, or unsupported performance claims;
- pricing is reverse-engineered from the founder revenue target instead of buyer economics;
- fulfillment cannot safely support the promised scope;
- proof would require leaking sensitive/private/IP data;
- a provider write would exceed current authority;
- payment, contract, delivery, refund, or dispute state is contradictory;
- Attack 2000 leaves a material unresolved HOLD or any KILL.

## Reporting

For a Revenue Proof OS cycle report only the highest-value state changes:

```text
REALITY
SIX-PLANE STATE
ATTACK 2000 PASS I
TODAY'S MONEY MOVE
OFFER
TARGETS / BUYER STATE
SOURCE COVERAGE
OODA DECISION
PROOF
REVENUE PLANES
SEND LEASE STATUS
FINGERPRINT + CONTINUITY COOKIE
ATTACK 2000 PASS II
RISK
ROLLBACK
NEXT GATE
```

One-line law: activity is not accomplishment; execution truth is not outcome truth; proof before claim; authority before consequence.
