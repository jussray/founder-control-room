# Commercial Product Graduation Rule

## Purpose

Founder Control Room may turn useful internal methods, examples, templates, workflows, and observed founder problems into sellable products. Commercialization must increase founder and customer capability without letting presentation outrun substance.

This rule is portfolio-wide for FCR-governed commercial work. It does not turn every project, workflow, repository, or example into a product automatically.

The machine-readable portfolio packaging contract is `config/portfolio-commercial-architecture.json`. When commercial prose and that contract disagree, reconcile the conflict before making a current commercial claim.

## Core invariant

> Inspiration may trigger a product. It may never become the product.

External references, screenshots, competitor examples, visual inspiration, public frameworks, or another creator's work may reveal a problem worth solving. The sellable artifact must stand independently on Juss-owned value, language, structure, implementation, teaching, evidence, or experience.

Do not copy another creator's distinctive wording, graphics, examples, naming, layout, or presentation and relabel it as an FCR product.

## Repository is not company

A repository is an implementation or evidence carrier. It is not automatically a separate company, offer, price, funnel, or customer-acquisition story.

Technical independence and commercial packaging are different questions. A system may remain independently callable, portable, testable, or deployable while still being sold by default as a module inside a stronger parent product.

Before creating a separate commercial identity, prove all of the following independently:

1. a distinct customer or job-to-be-done;
2. a payer who rationally buys the offer;
3. customer value that is not clearer when bundled into the parent product;
4. a revenue mechanism;
5. a repeat engine;
6. a measurable North Star;
7. a real delivery path; and
8. evidence that separate packaging improves paid demand rather than multiplying founder overhead.

If those facts are absent, keep the capability as an engine, module, acquisition wedge, research lane, or supporting system.

## Umbrella and child-product rule

A strong umbrella product may reveal smaller sellable products. A visual concept is not enough to graduate one.

For example, Founder Intent Formula currently contains worked-example lanes such as Build, Fix, Research, Business/Offer, and Content. Those lanes may become independent products only when each has its own complete customer value, deliverable substance, truthful promise, evidence, and verified delivery path.

A child product is not graduated merely because:

- a marketing image looks sellable;
- the parent product contains an example page;
- a workflow name exists;
- an internal capability can perform related work;
- a separate repository exists;
- analytics show interest in an adjacent topic; or
- the founder approves exploring it.

## Graduation states

Use this sequence:

```text
INSPIRED
→ TRANSFORMED
→ ORIGINAL
→ USEFUL
→ VERIFIED
→ SELL
```

Definitions:

- `INSPIRED`: a problem, pattern, or opportunity has been observed.
- `TRANSFORMED`: the idea has been reframed through Juss/FCR methods rather than copied.
- `ORIGINAL`: the artifact has independent wording, structure, design, examples, and value.
- `USEFUL`: the customer receives a concrete capability, shortcut, understanding, workflow, template, implementation, or reusable asset.
- `VERIFIED`: contents, claims, price/status, purchase path, delivery path, and relevant customer experience have been checked at the required truth plane.
- `SELL`: the product may be activated or promoted within current founder authority.

If any required state is `UNKNOWN`, `BLOCKED`, stale, or contradicted, the product remains draft or ungraduated.

## Marketing truth rule

Marketing may be cinematic, dramatic, premium, emotional, and highly visual. Claims may not be.

A product image may amplify attention through composition, lighting, typography, metaphor, motion, and product staging, but it must not invent:

- capabilities;
- included assets;
- customers or testimonials;
- revenue or conversion outcomes;
- integrations;
- automation;
- platform support;
- proof states;
- delivery behavior; or
- guarantees.

Marketing copy must map back to the actual product fingerprint and current proof cookie.

Native platform analytics screenshots and exports are evidence about the observed account and time window. They are not automatically product-performance claims. Visibility, usage, comments, likes, saves, views, downloads, installs, internal use, and successful deployment are not revenue unless authoritative economic evidence connects them to a payment or other legitimate money outcome.

For social analytics, native platform evidence remains the highest-authority source; secondary tools may corroborate but may not override it or manufacture causality.

## Commercial identity and money path

Every commercial product or candidate must answer these fields before a money claim is promoted:

```text
REPOSITORY ROLE
Core company / commerce business / module / engine / acquisition wedge / research lane / infrastructure

PORTFOLIO PILLAR
Which customer-facing business identity owns the offer by default

CUSTOMER
Who uses or benefits from the product

PAYER
Who actually transfers money; may differ from the user

PROBLEM
The concrete job, pain, or desired progress

VALUE
Why paying is rational for this customer or payer

REVENUE MECHANISM
Subscription / transaction margin / usage / license / service / other explicit mechanism

REPEAT ENGINE
Why the payer would rationally pay again or remain subscribed

NORTH STAR
The narrow metric that best represents compounding customer value and legitimate economic progress

PROOF
What is actually demonstrated now

UNPROVEN
What must not be presented as true yet

NEXT MONEY TEST
The smallest reversible test that can produce or falsify a real paid outcome
```

A product without a repeat engine may still be a legitimate one-time business, but the one-time mechanism must be explicit. A recurring-revenue claim requires recurring payment or contract evidence, not a recurring-use hypothesis.

Content teardowns should use the same fields. A hook may simplify the language, but the underlying content artifact must preserve customer, payer, revenue mechanism, repeat engine, proof, unproven state, and next money test.

## Product fingerprint

Every commercial product or candidate product should have a non-secret product fingerprint sufficient to distinguish what is actually being sold.

At minimum bind:

```text
PRODUCT IDENTITY
Name / slug / parent product when applicable

REPOSITORY ROLE
Core company / commerce business / module / engine / acquisition wedge / research lane / infrastructure

PORTFOLIO PILLAR
The default customer-facing business identity

PROBLEM
What specific customer problem or job it addresses

CUSTOMER
Who uses or benefits from the product

PAYER
Who transfers money

VALUE
Why the offer is rational to buy

PROMISE
What outcome or capability the product truthfully offers

CONTENTS
What files, templates, workflows, examples, services, or access are actually included

REVENUE MECHANISM
How money can legitimately enter

REPEAT ENGINE
Why the customer would pay again or remain subscribed

NORTH STAR
The metric representing durable customer and economic value

SOURCE FRAMEWORK
Which Juss/FCR methods or project capabilities it derives from

VERSION
Current release identity

COMMERCIAL STATE
Draft / active / archived, current price, and sales channel

PROOF
Current authoritative receipts supporting material claims

UNPROVEN
Important claims that remain inferred, unknown, blocked, stale, or unobserved

NEXT MONEY TEST
The smallest reversible paid-demand test

DELIVERY
How the buyer receives what was purchased
```

The fingerprint is a continuity marker, not a secret, entitlement, approval, license key, browser fingerprint, device fingerprint, or tracking identifier.

A material change to promise, contents, version, price, sales channel, delivery behavior, customer, payer, revenue mechanism, repeat engine, authority boundary, or supporting evidence creates a new product fingerprint or invalidates the prior one for current claims.

## Proof cookie

A proof cookie is a non-secret release-continuity marker bound to one exact product fingerprint and the proof observed for that release.

It may record that the following were verified:

```text
CONTENTS INSPECTED
CLAIMS CHECKED AGAINST CONTENTS
MARKETING CHECKED AGAINST PRODUCT TRUTH
PRICE / STATUS READ BACK
PURCHASE PATH VERIFIED
DELIVERY PATH VERIFIED
REQUIRED CUSTOMER PATH VERIFIED
ECONOMIC EVIDENCE OBSERVED WHEN A MONEY CLAIM IS MADE
EVIDENCE SOURCE + OBSERVED TIME
PRODUCT FINGERPRINT
```

A proof cookie never grants authority, never carries approval forward, never proves an unobserved customer outcome, and is never stored as a browser tracking cookie merely because it is called a cookie.

Expire the proof cookie when any bound subject changes materially, including product contents, price, listing state, checkout, delivery mechanism, runtime, provider, authority, or evidence state. Preserve the expired cookie as historical provenance and reacquire proof before making current claims.

## Commercial workflow

For a nontrivial product or commercialization task, use the same founder operating discipline rather than creating a new OS:

```text
Founder Intent
→ Confess / Reality
→ Authoritative Source
→ VERIFIED / INFERRED / UNKNOWN / BLOCKED
→ ULTRATHINK
→ Red Team 1 — premise
→ Lindy mode
→ L99
→ OODA
→ Bill Gates pass
→ Elon Musk pass
→ Red Team 2 — implementation
→ Smallest reversible build
→ Verification
→ Product fingerprint
→ Proof cookie
→ Commercial graduation state
→ Rollback / Next Gate
```

The Bill Gates and Elon Musk labels are internal heuristic passes, not endorsements, partnerships, or claims of affiliation.

The workflow must:

1. identify the authoritative repository, branch/head, product/listing, and provider state;
2. state the founder goal, suspected gap, exact evidence needed first, and stop condition;
3. challenge whether a separate product should exist before packaging one;
4. reuse existing work and avoid duplicate products or disconnected operating systems;
5. identify customer and payer separately;
6. identify the money mechanism, repeat engine, North Star, current proof, unproven claims, and next money test;
7. choose the smallest complete customer value;
8. keep visual ambition separate from factual claims;
9. verify the cheapest valid layer first, then the real customer and economic path when launch requires it;
10. bind the result to a product fingerprint and current proof cookie;
11. stop when the product's required graduation state is proven; and
12. return one next founder gate.

Workflow names never grant publication, pricing, discount, spending, checkout, provider, merge, deployment, or customer-contact authority.

## Required report

Return commercial implementation work in this shape:

```text
REALITY
What is verified now.

FIX
What changed or what product substance was created.

PROOF
Evidence supporting the current graduation state.

RISK
What could still be wrong or unproven.

ROLLBACK
How to reverse safely.

FINGERPRINT
The current product identity and material bound state.

PROOF COOKIE
What exact release proof is current and what would expire it.

NEXT GATE
One exact founder decision or action.
```

## Portfolio rule

Founder Control Room is the single customer-facing founder operating-system shell by default. Chief AI Machine, PromptOS, Truth Weaver, Truth Compass, Sol continuity, L99, OODA, Lindy, Red Team, goalfix, Proof Mode, sales skills, providers, and future add-ons may contribute to product creation or technical operation, but none becomes an independent commercial authority merely because it has its own repository or runtime.

Technical independence may remain a required architecture property. Separate commercial packaging requires separate customer, payer, value, revenue, repeat, and demand proof.

StoryEngine remains the creator-facing identity for its L99 runtime. Se’kret Bip remains the family-product identity for Bip-family modules by default. Commerce brands preserve independent catalog and unit-economics truth even when they share generic operating infrastructure.

A sellable product may have its own customer-facing identity when that identity survives the graduation rule. Its internal authority, evidence, approval, and outcome truth must still remain legible to FCR when it is FCR-governed work.
