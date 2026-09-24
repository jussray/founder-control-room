# SOFA Flaw Finder Review Lane — Continuity Receipt

## Identity

- Repository: `jussray/founder-control-room`
- Base branch: `main`
- Original audited base: `cdf45f2759d9383bf24073473eb75e4ea522d3d3`
- Working branch: `fix/sofa-flaw-finder-review-lane`
- Current main explicitly rolled into this candidate: `0d85257fbb43920fe4b9c7cfab534c29c5e882b8`
- Merge-refresh commit before this receipt update: `dc20b21b2eb73dafb048b84ad82264915ce07aa3`
- Last green exact-head proof now historical/superseded for merge freshness: `6d8007910d3a044c794b474c463661b025b6cb0a`
- Audit goal: bind the configured SOFA `Flaw Finder` to FCR as a bounded external review/evidence lane without falsely promoting it to a trusted peer operator, independent-review witness, publisher, merger, deployer, or provider authority.

> Resolve `main` and this branch again at use time. A newer base or candidate head supersedes predecessor merge proof.

## VERIFIED

- The SOFA slice remains additive and isolated to seven files when compared against the live base during merge review.
- No canonical FCR agent-registry entry, runtime route, database mutation, deployment mutation, provider configuration, or SOFA publication authority is added by this slice.
- The external observation contract requires all fifteen attack flows, including `self_attack`, counterexample/steelman passes, and a second-pass attack against the proposed fix.
- Observations are bound to repository, branch, exact head SHA, source reference/fingerprint, freshness, findings, and a deterministic observation hash.
- Observations explicitly remain `draft_only`, `proposalOnly: true`, `countsAsIndependentReview: false`, with external-write/merge/deploy/publish/provider/registry authority all false.
- The SOFA identity preflight creates a fresh `/api/sessions` session, then performs the owned-agent identity read through `/api/me/agents`, binds exactly one `Flaw Finder`, and refuses role/publication-policy drift.
- Identity receipts deliberately exclude both the API key and session id and remain non-authorizing.
- Merge review self-attack found and repaired a provenance defect in the first identity implementation: a task label had been sent as `X-Sofa-Model-Name`. The candidate now sends neutral session metadata rather than pretending the task label is a model identity.
- The owned-agent extractor accepts the observed collection shapes `[]`, `{agents: []}`, and `{items: []}` while still requiring exactly one named Flaw Finder.
- A dedicated exact-head proof workflow now exists at `.github/workflows/sofa-flaw-finder-proof.yml`, with read-only repository permissions and pinned checkout/setup actions.
- Historical exact-head CI proof for `6d8007910d3a044c794b474c463661b025b6cb0a` passed `npm run typecheck`, both focused Flaw Finder Vitest contracts, Playwright Chromium installation, and the repository `npm run test:e2e` gate.
- The first proof attempt exposed one TypeScript-only test-fixture error; the repair changed only the unsafe authority-widening test cast, and the successor exact head passed all gates.
- Current `main@0d85257fbb43920fe4b9c7cfab534c29c5e882b8` was rolled into the branch without changing the seven-file SOFA scope.

## INFERRED

- A future authenticated SOFA adapter can normalize provider-attested Flaw Finder drafts into the external observation contract without changing FCR's existing independent-review authority model.
- Current main changes observed during the refresh do not overlap the seven SOFA paths, so source integration is expected to remain low-conflict. Exact-head CI, not this inference, decides merge readiness.

## UNKNOWN

- The real owned-agent payload for this account until FCR uses the actual SOFA credential and receives the live response.
- The real Flaw Finder agent id and resulting identity fingerprint.
- Whether the deployed FCR HTTP stack reaches SOFA without a Cloudflare transport challenge.
- Provider-attested draft/task response fields needed for a full Flaw Finder request → draft → FCR round trip.

## BLOCKED

- The historical green proof on `6d8007910d3a044c794b474c463661b025b6cb0a` cannot authorize a merge after the branch was refreshed onto newer `main`; the new exact candidate must pass the same proof gates.
- No live SOFA credential is available in this tool session, so authenticated SOFA identity/runtime proof cannot be claimed.
- No new pull request is being opened for this slice, per founder workflow preference; the dedicated branch proof workflow is the verification path.

## Changes

- `.github/workflows/sofa-flaw-finder-proof.yml`
- `src/review/externalFlawFinderObservation.ts`
- `src/review/externalFlawFinderObservation.test.ts`
- `src/review/sofaFlawFinderIdentity.ts`
- `src/review/sofaFlawFinderIdentity.test.ts`
- `docs/SOFA_FLAW_FINDER_REVIEW_LANE.md`
- this continuity receipt

## Merge review verdict

**SOURCE-REVIEWED; CURRENT EXACT-HEAD REPROOF REQUIRED.**

The predecessor exact head proved the source/tests/browser gate once. The current merge-refresh deliberately invalidates that proof for merge freshness. Merge only after the successor candidate is green and `main` still matches the base embedded in that candidate.

## Rollback

The slice is additive and isolated on `fix/sofa-flaw-finder-review-lane`. Before integration, rollback is deleting the branch. After integration, revert the seven focused SOFA files. No provider, runtime, database, deployment, or SOFA publication rollback is required because this source slice performs none of those mutations.

## Next proof gate

1. Let the receipt update trigger the exact-head SOFA proof workflow.
2. Require green `npm run typecheck`, both focused Vitest contracts, and repository Playwright E2E on that exact candidate.
3. Inspect logs/artifacts for any failure and repair only the causal SOFA slice.
4. Re-read `main` immediately after proof; any base movement expires merge freshness and requires another refresh/proof loop.
5. When base and candidate are simultaneously fresh and green, obtain founder approval bound to the exact repository + base SHA + candidate SHA.
6. Merge only that focused candidate.
7. Separately, once a live SOFA credential is available, run authenticated identity preflight and prove the full Flaw Finder request/draft round trip before considering registry promotion.
