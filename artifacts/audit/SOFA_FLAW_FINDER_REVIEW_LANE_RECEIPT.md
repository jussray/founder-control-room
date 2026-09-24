# SOFA Flaw Finder Review Lane — Continuity Receipt

## Identity

- Repository: `jussray/founder-control-room`
- Base branch: `main`
- Original audited base: `cdf45f2759d9383bf24073473eb75e4ea522d3d3`
- Working branch: `fix/sofa-flaw-finder-review-lane`
- Current main explicitly rolled into this candidate: `0d85257fbb43920fe4b9c7cfab534c29c5e882b8`
- Merge-refresh commit: `dc20b21b2eb73dafb048b84ad82264915ce07aa3`
- Last fully green exact-head proof before the final self-attack repair: `cc8c4e77890cb0ee509677ffb6ac676c5803c573`
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
- Merge review self-attack repaired an earlier provenance defect where a task label had been used as model metadata; session metadata is now neutral rather than pretending the task label is a model identity.
- A second self-attack found that `observedAt` and `sessionExpiresAt` were validated but not cryptographically bound into the identity fingerprint. That allowed freshness fields to be edited without invalidating the fingerprint. The candidate now binds both timestamps into the fingerprint and includes a regression test that rejects expiry tampering.
- Provider calls now fail closed on HTTP redirects rather than allowing the authenticated identity preflight to follow an unexpected redirect.
- The owned-agent extractor accepts the observed collection shapes `[]`, `{agents: []}`, and `{items: []}` while still requiring exactly one named Flaw Finder.
- A dedicated exact-head proof workflow exists at `.github/workflows/sofa-flaw-finder-proof.yml`, with read-only repository permissions and pinned checkout/setup actions.
- Exact-head CI on `cc8c4e77890cb0ee509677ffb6ac676c5803c573` passed `npm run typecheck`, both focused Flaw Finder Vitest contracts, Playwright Chromium installation, and repository `npm run test:e2e` before the final freshness-binding repair.
- Current `main@0d85257fbb43920fe4b9c7cfab534c29c5e882b8` was rolled into the branch without widening the seven-file SOFA scope.

## INFERRED

- A future authenticated SOFA adapter can normalize provider-attested Flaw Finder drafts into the external observation contract without changing FCR's existing independent-review authority model.
- Current main changes observed during the refresh do not overlap the seven SOFA paths, so source integration is expected to remain low-conflict. Exact-head CI, not this inference, decides merge readiness.

## UNKNOWN

- The real owned-agent payload for this account until FCR uses the actual SOFA credential and receives the live response.
- The real Flaw Finder agent id and resulting identity fingerprint.
- Whether the deployed FCR HTTP stack reaches SOFA without a Cloudflare transport challenge.
- Provider-attested draft/task response fields needed for a full Flaw Finder request → draft → FCR round trip.

## BLOCKED

- The final freshness-binding repair changes the exact head after the previous green proof; the successor exact candidate must pass the same proof workflow before merge readiness can be claimed.
- No live SOFA credential is available in this tool session, so authenticated SOFA identity/runtime proof cannot be claimed.
- No new pull request is being opened for this slice under the current founder workflow preference. Current FCR merge policy still requires an exact open PR plus deterministic independent review and founder-final approval before any merge can execute.

## Changes

- `.github/workflows/sofa-flaw-finder-proof.yml`
- `src/review/externalFlawFinderObservation.ts`
- `src/review/externalFlawFinderObservation.test.ts`
- `src/review/sofaFlawFinderIdentity.ts`
- `src/review/sofaFlawFinderIdentity.test.ts`
- `docs/SOFA_FLAW_FINDER_REVIEW_LANE.md`
- this continuity receipt

## Merge review verdict

**SOURCE-REVIEWED; FINAL EXACT-HEAD REPROOF REQUIRED.**

The predecessor exact head proved the source/tests/browser gate. The final self-attack repair intentionally invalidates that predecessor proof for merge freshness. Merge only after the successor candidate is green, `main` still matches the embedded base, the canonical PR/deterministic-review path exists, and fresh founder-final approval is bound to that exact PR/base/head.

## Rollback

The slice is additive and isolated on `fix/sofa-flaw-finder-review-lane`. Before integration, rollback is deleting the branch. After integration, revert the seven focused SOFA files. No provider, runtime, database, deployment, or SOFA publication rollback is required because this source slice performs none of those mutations.

## Next proof gate

1. Let this receipt update trigger the exact-head SOFA proof workflow.
2. Require green `npm run typecheck`, both focused Vitest contracts, and repository Playwright E2E on that exact candidate.
3. Inspect logs/artifacts for any failure and repair only the causal SOFA slice.
4. Re-read `main` immediately after proof; any base movement expires merge freshness and requires another refresh/proof loop.
5. Preserve the current no-new-PR preference unless the founder explicitly authorizes the one PR required by FCR's canonical merge membrane.
6. If that PR is authorized, require deterministic independent review, current provider diff/base/head readback, and fresh founder-final approval bound to the exact repository + PR + base SHA + candidate SHA.
7. Merge only that exact focused candidate.
8. Separately, once a live SOFA credential is available, run authenticated identity preflight and prove the full Flaw Finder request/draft round trip before considering registry promotion.
