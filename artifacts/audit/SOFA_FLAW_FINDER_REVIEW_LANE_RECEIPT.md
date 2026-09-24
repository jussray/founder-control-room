# SOFA Flaw Finder Review Lane — Continuity Receipt

## Identity

- Repository: `jussray/founder-control-room`
- Base branch: `main`
- Original audited base: `cdf45f2759d9383bf24073473eb75e4ea522d3d3`
- Working branch: `fix/sofa-flaw-finder-review-lane`
- Last main SHA explicitly rolled into the candidate during this review: `0a79545ecf396d287d977a2f36ee2c5f4ec7b0c1`
- Candidate immediately before this receipt update: `acf54e85f8cfed59f238ed137023b1ed399c052a`
- Audit goal: bind the configured SOFA `Flaw Finder` to FCR as a bounded external review/evidence lane without falsely promoting it to a trusted peer operator, independent-review witness, publisher, merger, deployer, or provider authority.

> Resolve `main` and this branch again at use time. The repository is moving quickly; a newer base or head supersedes these SHA observations and requires fresh proof.

## VERIFIED

- The SOFA slice remains additive and isolated to six files when compared against the live base during merge review.
- No canonical FCR registry entry, runtime route, database, deployment, provider configuration, or publication authority is added by this slice.
- The external observation contract requires all fifteen attack flows, including `self_attack`, counterexample/steelman passes, and a second-pass attack against the proposed fix.
- Observations are bound to repository, branch, exact head SHA, source reference/fingerprint, freshness, findings, and a deterministic observation hash.
- Observations explicitly remain `draft_only`, `proposalOnly: true`, `countsAsIndependentReview: false`, with merge/deploy/publish/provider/registry authority all false.
- The SOFA identity preflight creates a fresh `/api/sessions` session, then performs the owned-agent identity read through `/api/me/agents`, binds exactly one `Flaw Finder`, and refuses role/publication-policy drift.
- Identity receipts deliberately exclude both the API key and session id and remain non-authorizing.
- Merge review self-attack found a provenance defect in the first identity implementation: a task label had been sent as `X-Sofa-Model-Name`. The candidate now sends neutral session metadata (`unknown`) instead of pretending that label is a model identity, includes the optional provider metadata, and keeps the owned-agent read limited to Bearer + fresh session headers.
- The owned-agent extractor accepts the currently observed collection shapes used by clients (`[]`, `{agents: []}`, `{items: []}`) while still requiring exactly one named Flaw Finder.
- Public SOFA evidence confirms session creation requires Bearer auth plus client/model metadata and authenticated reads require a fresh `X-Sofa-Session`.

## INFERRED

- A future authenticated SOFA adapter can normalize provider-attested Flaw Finder drafts into the external observation contract without changing FCR's existing independent-review authority model.
- The six-file source slice should rebase/merge cleanly because current `main` changes observed during review do not overlap these paths. This is a source-diff inference, not test or runtime proof.

## UNKNOWN

- The real owned-agent payload for this account until FCR uses the actual SOFA credential and receives the live response.
- The real Flaw Finder agent id and resulting identity fingerprint.
- Whether the deployed FCR HTTP stack reaches SOFA without a Cloudflare transport challenge.
- Provider-attested draft/task response fields needed for a full Flaw Finder request → draft → FCR round trip.

## BLOCKED

- `npm run typecheck`, focused Vitest, and the repository Playwright lane have not executed on the exact candidate in this tool session.
- GitHub has no existing pull request for `fix/sofa-flaw-finder-review-lane`, and the available GitHub connector does not expose workflow-dispatch creation for running the normal PR workflow directly.
- A local clone attempt failed because this execution container cannot resolve `github.com`, so local repository verification cannot substitute for CI.
- No live SOFA credential is available in this tool session, so authenticated identity/runtime proof cannot be claimed.
- Main moved again while review was in progress. Any final integration candidate must first be refreshed onto the then-current base and re-proven.

## Changes

- `src/review/externalFlawFinderObservation.ts`
- `src/review/externalFlawFinderObservation.test.ts`
- `src/review/sofaFlawFinderIdentity.ts`
- `src/review/sofaFlawFinderIdentity.test.ts`
- `docs/SOFA_FLAW_FINDER_REVIEW_LANE.md`
- this continuity receipt

## Merge review verdict

**SOURCE REVIEWED / NOT MERGE-PROVEN.**

Do not merge this candidate merely because the source review is clean. Repository policy and founder operating rules require exact-head verification. A moving base also invalidates predecessor exact-head proof.

## Rollback

The slice is additive and isolated on `fix/sofa-flaw-finder-review-lane`. Before integration, rollback is deleting the branch. After integration, revert the focused SOFA files. No provider, runtime, database, deployment, or SOFA publication rollback is required because this source slice performs none of those mutations.

## Next proof gate

1. Resolve current `main` and roll the candidate onto that exact base without widening the six-file scope.
2. Run exact-head `npm run typecheck` plus focused Vitest for both Flaw Finder contracts.
3. Run the repository Playwright E2E lane on that same exact head.
4. Inspect logs/artifacts for failures and repair only the causal SOFA slice if needed.
5. Re-read current base/head after proof; any movement expires the candidate proof.
6. Obtain fresh founder exact-candidate merge approval bound to repository + base SHA + head SHA.
7. Merge only when those gates are green.
8. Separately, once a live SOFA credential is available, run authenticated identity preflight and then build/prove the full Flaw Finder request/draft round trip before considering registry promotion.
