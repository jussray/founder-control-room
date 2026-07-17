# Redteam I — Attack the City-Agnostic Premise

## Claim under attack

The Johnstown Economic Opportunity Command Center can become a reusable platform for other municipalities and regions.

## Failure modes

1. **Johnstown is only hidden in seed data.** Renaming columns is not portability if business logic, UI ordering, or defaults still assume one city.
2. **Municipal structures differ.** Cities, counties, regional authorities, tribal governments, and states use different program ownership and authority layers.
3. **Funding vocabulary is unstable.** CDBG, revolving loans, procurement, tax incentives, philanthropy, and private capital cannot share one hard-coded eligibility form.
4. **Evidence quality varies.** A platform can create false certainty when a jurisdiction has incomplete, stale, or contradictory source material.
5. **Local policy is not interchangeable.** A scoring engine may prioritize an opportunity while legal eligibility or local authority makes it impossible.
6. **Public dashboards can leak operational intent.** Founder planning, unannounced partnerships, applicant data, and internal opportunity hypotheses must not become public by default.
7. **A second demo city can be fake proof.** Copying the same JSON under another name does not prove database, API, or workflow portability.

## Premise decision

Proceed only if city identity is configuration and relational data, factual claims carry provenance, scoring is jurisdiction-invariant, unknown jurisdictions fail closed, and operational data remains service-role/founder protected.

## Proof required

- one generic jurisdiction schema;
- no city-named database columns or score weights;
- two jurisdiction fixtures using one API path;
- identical-signal score equality;
- explicit synthetic-data classification;
- Playwright rejection tests for fallback, malformed input, and leakage.
