# L99 Sales Authority Model

States: `observed → qualified → offer_draft → devil_reviewed → founder_approved → contacted → committed → fulfilled → retained | lost | refunded`.

No state authorizes the next. Separate gates govern public research, internal aggregate analysis, drafting, pricing and discounts, external contact, spending, applications, checkout, refunds, deployment, database mutation, and rollback.

Bind each decision to project, offer version, audience, provenance, evidence timestamp, assumptions, disqualifiers, owner, environment, and next gate. Operational evidence remains metadata-minimized and excludes raw private user content.

Duplicate or ambiguous actions fail closed. Partial completion is recorded before retry. Customer harm, misleading claims, privacy leakage, authority mismatch, or broken fulfillment triggers pause and rollback review.