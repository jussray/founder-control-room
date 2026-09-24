# SOFA Flaw Finder Review Lane — Continuity Receipt

## Identity

- Repository: `jussray/founder-control-room`
- Base branch: `main`
- Base SHA inspected: `cdf45f2759d9383bf24073473eb75e4ea522d3d3`
- Working branch: `fix/sofa-flaw-finder-review-lane`
- Audit goal: bind the newly configured SOFA `Flaw Finder` to FCR as a bounded external review/evidence lane without falsely promoting it to a trusted peer operator or publication authority.

## VERIFIED

- The canonical FCR agent registry does not currently contain SOFA or `Flaw Finder`.
- FCR already distinguishes operator capability from merge/deploy/publish/provider authority.
- FCR independent-review receipts are exact-repository / PR / base / head / diff / policy bound and remain proposal-only/non-authorizing.
- The new branch adds a provider-specific external observation contract, focused unit tests, and the review-lane contract document.
- The contract requires all fifteen attack flows, including `self_attack` and a second-pass attack against the proposed fix.
- The contract binds repository, branch, exact head SHA, source reference/fingerprint, freshness, findings, and zero-authority state into a deterministic observation hash.
- The contract explicitly sets `countsAsIndependentReview: false` and `registryPromotion: false`.

## INFERRED

- A future authenticated SOFA adapter can normalize provider-attested Flaw Finder drafts into this external observation contract without changing FCR's existing independent-review authority model.

## UNKNOWN

- Exact SOFA API/connector surface for dispatching to this specific agent.
- Provider-attested SOFA agent/runtime identity fields available to FCR.
- Whether SOFA exposes a stable draft id, webhook, or retrieval endpoint suitable for sourceRef binding.

## BLOCKED

- Real SOFA ↔ FCR runtime round trip is not implemented because no authenticated provider/API contract was inspected in this slice.
- Playwright proof is not available because there is no FCR UI/runtime adapter for this lane yet.
- Local `npm run typecheck`, focused Vitest, and repository CI were not run in this tool session. GitHub Actions reported no workflow runs for the working branch at the time inspected.

## Changes

- `src/review/externalFlawFinderObservation.ts`
- `src/review/externalFlawFinderObservation.test.ts`
- `docs/SOFA_FLAW_FINDER_REVIEW_LANE.md`
- this continuity receipt

## Rollback

The slice is additive and isolated on `fix/sofa-flaw-finder-review-lane`. Roll back by deleting the branch or reverting the four additive files. No runtime route, database, provider, deployment, or canonical agent-registry state was changed.

## Next proof gate

1. Inspect the real SOFA provider/API capability for the configured Flaw Finder agent.
2. Add the smallest authenticated adapter only if the provider can prove exact agent/runtime identity and draft source identity.
3. Run `npm run typecheck` and the focused Vitest file.
4. Add FCR surface wiring only after the adapter is real.
5. Run the real founder-visible Playwright round trip on the exact candidate SHA.
6. Only then consider registry promotion or merge.
