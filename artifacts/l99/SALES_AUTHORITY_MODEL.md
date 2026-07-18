# L99 Sales Authority Model

## State model

`observed → qualified → offer_draft → devil_reviewed → founder_approved → contacted → committed → fulfilled → retained | lost | refunded`

No state transition is implied by the prior state. Each material transition requires its own actor, evidence, timestamp, and authorization.

## Authority matrix

| Action | Minimum authority |
|---|---|
| Read public market evidence | Approved read path |
| Analyze internal aggregate metrics | Authorized project-scoped read |
| Draft positioning or outreach | Founder-requested drafting |
| Change price, discount, terms, or catalog | Separate founder approval and repository proof |
| Contact a lead, official, vendor, or partner | Explicit communication approval |
| Spend funds or launch paid acquisition | Explicit budget approval |
| Submit an application or accept terms | Explicit founder approval |
| Execute checkout, refund, deployment, or database mutation | Dedicated operational gate |

## Evidence contract

Bind every decision packet to project, offer version, audience, source provenance, evidence timestamp, assumptions, disqualifiers, owner, and next gate. Operational evidence must be metadata-minimized and must not contain raw private user content.

## Failure handling

Duplicate or ambiguous actions fail closed. Partial completion is recorded before retry. Customer harm, misleading claims, privacy leakage, authority mismatch, or broken fulfillment triggers pause and rollback review.