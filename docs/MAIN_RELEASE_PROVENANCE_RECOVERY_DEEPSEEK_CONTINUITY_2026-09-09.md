# Main Release Provenance Recovery — Direct-Main Ratification — 2026-09-09

## Incident

The provenance incident is larger than the two DeepSeek/continuity commits that originally triggered this carrier.

The last confirmed PR-associated merge boundary before the direct-main sequence is:

- commit `34ffe99e77455f278b437f4cfc67c76e3df59a25` — merge commit for PR #765;
- tree `0dfa1ba952ae01908301af4748a0b04fa55b5eb5`.

The immutable direct-main incident tip audited by this recovery is:

- commit `027dfdd42f032a5c614c147ae9e1a824c2f506b9`;
- tree `f12e305a953de062eab15143fa032d9e8c0e1fc8`.

GitHub comparison from the merge boundary to the incident tip is 9 commits ahead / 0 behind.

## Exact direct-main sequence

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

Historical Git proof belongs to the release-provenance lane, not the ordinary unit-test suite.

`scripts/verify-main-release-historical-ratification.mjs` is the dedicated fail-closed verifier. The `Main Release Provenance` contract checks out the exact candidate with full Git history (`fetch-depth: 0`) and executes that verifier after the existing provenance adversarial tests.

The verifier refuses a shallow repository and then proves:

1. the merge-boundary commit resolves to tree `0dfa1ba952ae01908301af4748a0b04fa55b5eb5`;
2. the incident tip resolves to tree `f12e305a953de062eab15143fa032d9e8c0e1fc8`;
3. the first-parent commit sequence between those endpoints is exactly the nine SHAs listed above and in that order;
4. the file set changed by that range is exactly the 22 paths listed above;
5. the immutable incident tip remains an ancestor of the exact recovery candidate.

The predecessor Vitest implementation was removed because generic verification lanes legitimately use shallow exact-head checkouts. Requiring historical Git objects inside ordinary Vitest caused a false failure unrelated to source correctness. The dedicated provenance lane now owns the history requirement instead of globally widening every checkout.

This verifier is a range-integrity witness. It does not perform semantic review, retroactively create PR provenance, or grant merge/deploy authority.

## Review obligation

This carrier is not review-complete merely because its current PR delta is clean.

A qualifying recovery review must explicitly treat

`34ffe99e77455f278b437f4cfc67c76e3df59a25..027dfdd42f032a5c614c147ae9e1a824c2f506b9`

as the historical subject being ratified, including its nine-commit identity and 22-file scope. A review that inspects only the recovery wrapper is insufficient for the original provenance defect.

The two existing P1 findings remain unresolved until reviewer-side disposition confirms that the repaired carrier addresses them. This carrier does not self-resolve its own material review findings.

## Current-base rule

Current PR base/head truth is owned by the machine-maintained PR Continuity Receipt on PR #775, not by a durable current-main SHA in this document.

The two historical endpoint SHAs above are immutable incident evidence. They are not current-base claims.

If `main` or the PR head moves, predecessor exact-head CI, Playwright, semantic review, deterministic review, and authority receipts expire and must be reacquired on the successor candidate.

## Authority and product boundaries

The historical source state keeps the authority ceilings it introduced:

- DeepSeek remains instructor/challenger/proposal authority only, with no implementation, merge, deploy, provider-mutation, credential, or autonomous project-mutation authority.
- Claude, Perplexity, Codex/ChatGPT, and model-provider identities remain separated by the FCR multi-agent contract.
- Friend Intake remains model-free for the current first slice.
- FCR remains the single founder OS. Internal agents, skills, workflows, providers, and future add-ons extend the shared founder-intent loop rather than becoming competing operating systems.
- infrastructure monitoring remains consequence-only.
- stacked-PR refusal remains fail-closed and does not authorize force-push or silent rebase.

## Historical proof

Prior CI, Playwright, Verification Core, Documentation Truth, and continuity results remain historical evidence for the exact subjects on which they ran. They do not automatically become present-tense proof for a successor #775 head.

## Recovery rule

This PR is a forward ratification carrier. It does not claim that the nine historical commits were originally merged through pull requests, and merging this recovery cannot retroactively make that statement true.

The recovery instead:

- preserves the historical facts;
- binds the complete incident range instead of a cherry-picked subset;
- makes the range identity executable in the existing provenance lane;
- requires explicit semantic review of the historical subject;
- reacquires current exact-head machine/browser evidence;
- keeps merge/deploy authority false until the normal FCR authority chain permits integration.

## Acceptance criteria

Recovery may advance only when all of the following are true:

1. PR Continuity says the carrier is current with authoritative `main`;
2. the dedicated historical-ratification verifier passes inside the full-history Main Release Provenance lane and proves the exact nine-commit / 22-file range plus both tree identities;
3. required exact-head CI and browser/Playwright proof for the current PR head are terminal green;
4. independent review explicitly covers the historical ratification range, not only the wrapper delta;
5. both material P1 review threads receive reviewer-side disposition after the repair;
6. the normal trusted deterministic-review witness is successfully published and independently read back for the exact current candidate where required;
7. authenticated Founder Final binds the exact current PR/base/head after review and freshness checks;
8. merge, if authorized, occurs through the normal PR path without bypass;
9. post-merge provenance is reported with truthful scope and does not relabel the nine historical direct commits as originally PR-merged;
10. deployment and production-runtime equivalence remain separate claims with separate current evidence.

## Known separate blocker

The trusted deterministic-review publisher previously failed before publication because the GitHub Actions `production` environment `APP_PRIVATE_KEY`, mapped to runtime `GITHUB_PRIVATE_KEY`, did not contain a complete supported RSA private-key PEM.

That configuration defect is separate from the historical-range defect. Repairing the key cannot substitute for range review, and ratifying the range cannot substitute for the provider credential repair.

Never place the private key in this repository, PR, issue, log, artifact, or chat.

## Non-claims

This receipt does not claim that:

- the nine historical direct commits have been retroactively converted into PR merges;
- DeepSeek has live provider credentials;
- DeepSeek can mutate repositories;
- production has been deployed;
- the public FCR runtime serves this recovery candidate;
- provider configuration is repaired;
- merge authority is currently true.

Proof before claim.
