# Freshness Witness

`FreshnessWitness` classifies whether bounded repository evidence remains current. It is not an authority grant.

## Inputs

A witness binds an evidence subject to an expected repository `main` SHA, verified evidence references, a verification timestamp, and an explicit expiry. Evaluation also requires a separate at-use `FreshnessObservation` containing the observed repository identity, freshly observed current `main` SHA, observation time, and an explicit observation expiry. A separate evaluation time is supplied so cached observations cannot renew old truth.

## Fail-closed rules

- Repository SHAs must be full 40-character hexadecimal identities.
- The observed repository must match the witness repository.
- Evidence references must be present and already resolved as verified.
- Verification, observation, evaluation, and expiry timestamps must be strict UTC ISO timestamps when supplied as strings.
- Every witness must expire.
- Every observation must expire independently of the witness.
- A replayed observation becomes `STALE` once its own observation expiry has elapsed.
- A changed current `main` blocks the exact-version claim instead of allowing the stored witness to attest itself.
- An expired but otherwise matching witness is stale.

## Authority boundary

`VALID` means only that the supplied evidence is current against the supplied fresh observation at the supplied evaluation time. It never grants merge, deploy, publish, provider mutation, or other consequential authority. Callers must separately satisfy the applicable authority lease and provider/runtime gates.

## Relationship to Truth Lease

The freshness witness is a narrow evidence classifier. Truth Lease remains the bounded authority-facing composition for claims whose dependencies can decay. Consumers should use the freshness witness to classify repository evidence, then bind any consequential action through the applicable Truth Lease/authority contract rather than treating freshness as permission.
