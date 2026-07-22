# L99 — City-Agnostic System Model

## Authority

- Founder approves mission, branch, integration, deployment, rollback, secrets, and spending separately.
- City staff and program owners remain authoritative for local eligibility and policy.
- The scoring engine ranks evidence; it does not create legal authority.

## State model

```text
source observed
  -> program or signal normalized
  -> opportunity observing
  -> evidence qualified
  -> opportunity prioritized
  -> pilot approved
  -> outcome measured
  -> continue, revise, close, or reject
```

## Provenance

Every factual source stores publisher, source type, URL when available, observed time, publication time when available, confidence, and content hash. Scores store the exact signals, weights, version, band, and timestamp.

## Boundaries

- Control Room database remains separate from Se’kret Bip consumer data.
- No teen, journal, voice, media, parent, credential, or applicant-private content enters the economic tables.
- Public routes expose only the contract and visibly classified demo fixtures.
- Operational jurisdiction records remain service-role only in the initial migration.

## Release gates

1. Typecheck exact branch head.
2. Playwright portability suite exact branch head.
3. Migration syntax and rollback-only validation.
4. Security and performance advisors after migration application.
5. Founder integration approval.
6. Founder deployment approval.
7. Runtime health and second-jurisdiction smoke proof.

## Rollback

Repository rollback is a revert of the integration commit. Database rollback is a reviewed forward migration that removes or retires the new tables only after dependency inspection; production history is never rewritten.
