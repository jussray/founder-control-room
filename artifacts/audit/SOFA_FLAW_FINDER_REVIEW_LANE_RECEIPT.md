# SOFA Flaw Finder Review Lane — Continuity Receipt

## Identity

- Repository: `jussray/founder-control-room`
- Base branch: `main`
- Base SHA inspected: `cdf45f2759d9383bf24073473eb75e4ea522d3d3`
- Working branch: `fix/sofa-flaw-finder-review-lane`
- Audit goal: bind the configured SOFA `Flaw Finder` to FCR as a bounded external review/evidence lane without falsely promoting it to a trusted peer operator or publication authority.

## VERIFIED

- The canonical FCR agent registry does not currently contain SOFA or `Flaw Finder`.
- FCR already distinguishes operator capability from merge/deploy/publish/provider authority.
- FCR independent-review receipts are exact-repository / PR / base / head / diff / policy bound and remain proposal-only/non-authorizing.
- The branch contains a provider-specific external observation contract requiring all fifteen attack flows, including `self_attack` and a second-pass attack against the proposed fix.
- The observation contract binds repository, branch, exact head SHA, source reference/fingerprint, freshness, findings, and zero-authority state into a deterministic observation hash.
- The observation contract explicitly sets `countsAsIndependentReview: false` and `registryPromotion: false`.
- Current public SOFA API evidence supports an authenticated session flow using `POST /api/sessions` followed by authenticated `GET /api/me/agents` with `X-Sofa-Session`.
- Current public SOFA evidence describes `GET /api/me/agents` as returning owned agents with role/publication-policy metadata and shows the contributor + `draft_directly` policy vocabulary.
- `src/review/sofaFlawFinderIdentity.ts` now models the smallest non-mutating identity preflight: create a fresh session, read owned agents, require exactly one `Flaw Finder`, require `contributor`, require `draft_directly`, and emit a non-secret deterministic identity receipt.
- The identity receipt deliberately omits the API key and session id and carries no write, merge, deploy, publish, provider-mutation, or registry-promotion authority.

## INFERRED

- If the user's live SOFA credential returns the expected owned-agent record, FCR can bind later review traffic to a stable SOFA agent id before accepting any external observation.
- A future authenticated draft/review adapter can normalize provider-attested Flaw Finder output into `juss/external-flaw-finder-observation@v1` without changing FCR's independent-review authority model.

## UNKNOWN

- The user's live SOFA `agent_id` for Flaw Finder has not been observed in this tool session.
- Whether the deployed FCR runtime currently has a `SOFA_API_KEY` configured.
- Exact provider endpoint/contract for assigning a task specifically to the configured Flaw Finder agent.
- Whether SOFA exposes a stable draft id, webhook, or retrieval endpoint suitable for cryptographic sourceRef binding in this lane.

## BLOCKED

- Live SOFA identity preflight is not executed because no SOFA credential is available to this GitHub-only tool session.
- Real SOFA ↔ FCR review round trip is not implemented yet because provider-attested draft/source binding is still unproven.
- Playwright proof is not available because there is no founder-visible FCR UI/runtime adapter for this lane yet.
- Local `npm run typecheck`, focused Vitest, and repository CI have not yet been run in this tool session.

## Changes

- `src/review/externalFlawFinderObservation.ts`
- `src/review/externalFlawFinderObservation.test.ts`
- `src/review/sofaFlawFinderIdentity.ts`
- `src/review/sofaFlawFinderIdentity.test.ts`
- `docs/SOFA_FLAW_FINDER_REVIEW_LANE.md`
- this continuity receipt

## Provider evidence inspected

- SOFA public discussions confirming authenticated `POST /api/sessions` + `GET /api/me/agents` behavior and the requirement for `X-Sofa-Session` on authenticated API reads.
- SOFA public discussions confirming owned-agent metadata includes description, publication policy, and privileges, with `contributor` and `draft_directly` represented in current usage.
- Reports that some terminal HTTP stacks may receive Cloudflare 403 while browser-backed or other HTTP stacks succeed; transport success must therefore be proven in the actual FCR runtime rather than inferred from source code.

## Rollback

The slice is additive and isolated on `fix/sofa-flaw-finder-review-lane`. Roll back by deleting the branch or reverting the six additive/modified files listed above. No database, deployment, canonical agent registry, provider account, or SOFA publication state was changed by this source work.

## Next proof gate

1. Execute the live identity preflight with the user's SOFA credential from an authorized runtime and record only the returned non-secret identity receipt.
2. Verify the returned agent is exactly `Flaw Finder / contributor / draft_directly`; fail closed on drift or ambiguity.
3. Run `npm run typecheck` and the two focused Vitest files.
4. Inspect/implement the smallest provider-attested draft or task path that can bind a SOFA response to the exact Flaw Finder agent id and FCR request fingerprint.
5. Add founder-visible FCR surface wiring only after that adapter is real.
6. Run the real Playwright round trip on the exact candidate SHA.
7. Only then consider merge or registry promotion.
