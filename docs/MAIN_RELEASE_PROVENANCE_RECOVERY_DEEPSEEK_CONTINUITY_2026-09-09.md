# Main Release Provenance Recovery — Direct-Main Ratification — 2026-09-09

## Incident

A provenance audit found that the recovery scope is larger than the two DeepSeek/continuity commits that originally triggered this carrier.

The last confirmed PR-associated merge boundary before the direct-main sequence is:

- `34ffe99e77455f278b437f4cfc67c76e3df59a25` — merge commit for PR #765.
- tree: `0dfa1ba952ae01908301af4748a0b04fa55b5eb5`.

The immutable direct-main incident tip audited by this recovery is:

- `027dfdd42f032a5c614c147ae9e1a824c2f506b9`.
- tree: `f12e305a953de062eab15143fa032d9e8c0e1fc8`.

GitHub comparison from the merge boundary to the incident tip is 9 commits ahead / 0 behind.

## Exact direct-main sequence

The ratified historical range is exactly:

1. `3b48e557e6f460fbcb46561bf350f7249e2430d9` — implant ULTRATHINK self-attack contracts.
2. `3562df9d5f3f751b54c107ff502a5cc3b6615664` — align the first v1.4 implant marker.
3. `b5fc29cb8f51646e8d4c1c89fe84111e068d4c49` — align remaining v1.4 implant markers.
4. `5ac6d44bc42614fc7cccb20da1a8d4fe5008b710` — enable Claude and Perplexity as bounded FCR operators.
5. `ccc0e88d3295d42f95d7f42e0225863bdb4a3e19` — add governed DeepSeek instructor interop.
6. `d022ef600a3ae62bef796bfde9f521b33d63d1a9` — classify stacked-PR rollover refusal fail-closed.
7. `346f7498d7edfb97294f810e43b39edd3f6b62d3` — enforce the FCR single-OS cohesion audit.
8. `832512394d258c52648f8160b0e9eb2126af4f39` — require the cohesion audit for portfolio work.
9. `027dfdd42f032a5c614c147ae9e1a824c2f506b9` — gate infrastructure changes by consequence.

These commits remain immutable repository history. This recovery does not rewrite, delete, force-move, squash away, or relabel them.

## Exact affected file set

The audited historical range changes exactly these 22 paths:

- `AGENTS_FOUNDER_INTELLIGENCE.md`
- `docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md`
- `docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md`
- `docs/FCR_SINGLE_OS_COHESION_AUDIT.md`
- `docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_4_ADDENDUM.md`
- `docs/PHASE_0_SELF_ATTACK_TRUTH_MAP_2026-09-08.md`
- `scripts/pr-continuity.mjs`
- `scripts/verify-founder-intelligence-inheritance.mjs`
- `src/approvals/approval.ts`
- `src/chief/firstSliceContracts.ts`
- `src/content/publicClaimGate.ts`
- `src/implant/__tests__/selfAttackContracts.test.ts`
- `src/implant/contracts.ts`
- `src/lib/__tests__/agentInterop.test.ts`
- `src/lib/__tests__/agentRegistry.test.ts`
- `src/lib/agentInterop.ts`
- `src/lib/agentRegistry.ts`
- `src/model/execution.ts`
- `src/provider/manifest.ts`
- `src/state/machines.ts`
- `src/truth/truth.ts`
- `test/pr-continuity.attack20.test.mjs`

## Executable ratification boundary

`src/lib/__tests__/mainReleaseHistoricalRatification.test.ts` makes the historical range machine-checkable.

It verifies all of the following from Git history on the exact candidate:

1. the merge-boundary commit resolves to tree `0dfa1ba952ae01908301af4748a0b04fa55b5eb5`;
2. the incident tip resolves to tree `f12e305a953de062eab15143fa032d9e8c0e1fc8`;
3. the first-parent commit sequence between those endpoints is exactly the nine SHAs listed above and in the same order;
4. the file set changed by the range is exactly the 22 paths listed above;
5. the incident tip remains an ancestor of the recovery candidate.

The test is a range-integrity witness. It does not itself perform semantic review and does not manufacture historical PR provenance.

## Review obligation

This carrier is not review-complete merely because its new receipt/test delta is clean.

A qualifying recovery review must explicitly treat the historical range

`34ffe99e77455f278b437f4cfc67c76e3df59a25..027dfdd42f032a5c614c147ae9e1a824c2f506b9`

as the subject being ratified, including the nine-commit identity and 22-file scope above. A review that inspects only the wrapper document or only the current PR delta is insufficient for the original provenance defect.

The two existing P1 review findings stay unresolved until a reviewer confirms that the repaired carrier addresses them. Do not self-resolve them merely because this document changed.

## Current-base rule

Current branch/base/head truth is owned by the machine-maintained PR Continuity Receipt in PR #775, not by a durable SHA sentence in this document.

Historical endpoints above are immutable incident evidence. They are not a claim that the current PR base remains any historical SHA.

If `main` or the PR head moves, predecessor exact-head CI, Playwright, semantic review, deterministic review, and authority receipts expire and must be reacquired on the successor candidate.

This directly replaces the stale acceptance wording that hard-coded `main@d022ef600a3ae62bef796bfde9f521b33d63d1a9` as though it were still current.

## Authority and product boundaries

The historical source state remains bounded by the contracts it introduced:

- DeepSeek remains instructor/challenger/proposal authority only; it gains no implementation, merge, deploy, provider-mutation, credential, or autonomous project-mutation authority.
- Claude, Perplexity, Codex/ChatGPT, and model-provider identities remain separated by the FCR multi-agent contract.
- the current Friend Intake first slice remains model-free.
- FCR remains the single founder OS; internal agents, skills, workflows, providers, and future add-ons extend the shared founder-intent loop rather than becoming separate operating systems.
- infrastructure monitoring remains consequence-only and does not convert routine provider noise into founder work.
- stacked PR refusal remains fail-closed and does not authorize force-push or silent rebase.

## Historical proof

Prior CI, Playwright, Verification Core, Documentation Truth, and focused continuity evidence remains historical evidence about the predecessor subjects on which it ran.

It does not automatically become present-tense proof for a successor #775 head. Fresh exact-head evidence must be reacquired after every base/head movement.

## Recovery rule

This pull request is a forward ratification carrier. It does not claim that the nine historical commits were originally merged through pull requests.

It also does not claim that merging a wrapper document retroactively changes their historical provenance.

The intended recovery is narrower and truthful:

- preserve historical facts;
- bind the complete incident range instead of a cherry-picked subset;
- make the range identity executable and reviewable;
- obtain fresh review and machine proof on the recovery candidate;
- keep merge/deploy authority false until the normal FCR authority chain explicitly permits integration.

## Acceptance criteria

Recovery may advance only when all of the following are true:

1. the PR Continuity Receipt says the carrier is current with authoritative `main`;
2. the historical-ratification test proves the exact nine-commit / 22-file incident range and both tree identities;
3. required exact-head CI and browser/Playwright proof for the current PR head are terminal green;
4. independent review explicitly covers the historical ratification range, not only the wrapper delta;
5. both material P1 review threads are resolved by reviewer-side disposition after the repair;
6. the normal trusted deterministic-review witness is successfully published and independently read back for the exact current candidate where required;
7. authenticated Founder Final binds the exact current PR/base/head after review and freshness checks;
8. merge, if authorized, occurs through the normal PR path without bypass;
9. post-merge release provenance is reported with its truthful scope and does not relabel the nine historical direct commits as originally PR-merged;
10. deployment and production-runtime equivalence remain separate claims with separate current evidence.

## Known separate blocker

The trusted deterministic-review publisher previously failed before publication because the GitHub Actions `production` environment `APP_PRIVATE_KEY`, mapped to runtime `GITHUB_PRIVATE_KEY`, did not contain a complete supported RSA private-key PEM.

That configuration defect is separate from the historical-range defect. Repairing the key cannot substitute for range review, and fixing the range cannot substitute for the provider credential repair.

Never place the private key in this repository, PR, issue, log, artifact, or chat.

## Non-claims

This receipt does not claim that:

- the nine historical direct commits have been retroactively converted into PR merges;
- DeepSeek has live provider credentials;
- DeepSeek can mutate repositories;
- production has been deployed;
- the public FCR runtime serves the recovery candidate SHA;
- provider configuration is repaired;
- merge authority is currently true.

Proof before claim.
