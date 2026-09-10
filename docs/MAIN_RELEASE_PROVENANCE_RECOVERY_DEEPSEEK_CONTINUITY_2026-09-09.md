# Main Release Provenance Recovery - Multi-Incident Ratification - 2026-09-09

## Reality

PR #775 is a forward provenance-recovery carrier. It does not rewrite repository history and it does not claim that direct commits were originally merged through pull requests.

Two direct-main incidents are now in scope because `main` moved again while this recovery was being reviewed.

## Incident A - direct main after PR #765

Reviewed anchor:

- commit `34ffe99e77455f278b437f4cfc67c76e3df59a25`, merge commit for PR #765;
- tree `0dfa1ba952ae01908301af4748a0b04fa55b5eb5`.

Immutable incident tip:

- commit `027dfdd42f032a5c614c147ae9e1a824c2f506b9`;
- tree `f12e305a953de062eab15143fa032d9e8c0e1fc8`.

Exact first-parent sequence, 9 commits:

1. `3b48e557e6f460fbcb46561bf350f7249e2430d9`
2. `3562df9d5f3f751b54c107ff502a5cc3b6615664`
3. `b5fc29cb8f51646e8d4c1c89fe84111e068d4c49`
4. `5ac6d44bc42614fc7cccb20da1a8d4fe5008b710`
5. `ccc0e88d3295d42f95d7f42e0225863bdb4a3e19`
6. `d022ef600a3ae62bef796bfde9f521b33d63d1a9`
7. `346f7498d7edfb97294f810e43b39edd3f6b62d3`
8. `832512394d258c52648f8160b0e9eb2126af4f39`
9. `027dfdd42f032a5c614c147ae9e1a824c2f506b9`

Exact affected set, 22 paths:

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

## Incident B - direct main after PR #777

A later clean merge established a new reviewed anchor:

- commit `57e1ed8c2f21911d953587bfe8fe03cd92383a67`, merge commit for PR #777;
- tree `c39168199489c673f7f442221307c6791e413b89`.

While PR #775 was being repaired and re-reviewed, `main` advanced through two unsigned direct commits. The immutable Incident B tip is:

- commit `b3b1d21ca0bf1f6929b155f188551de7e9977ee4`;
- tree `349d276993cc56ccd0a088e543bd0228ffb18026`.

Exact first-parent sequence, 2 commits:

1. `f1a6f26e38bbc378d08b9002def0ceff34bf4396` - bind social analytics to native evidence;
2. `b3b1d21ca0bf1f6929b155f188551de7e9977ee4` - classify social analytics evidence sources.

Exact affected set, 2 paths:

- `AGENTS_FOUNDER_INTELLIGENCE.md`
- `.control-room/plugin-management.json`

Those files do not overlap the six-file effective recovery delta except that `AGENTS_FOUNDER_INTELLIGENCE.md` also appears historically in Incident A. Incident B is nevertheless a separate provenance interval and must not be hidden merely by rebasing or merging a future PR over it.

## History-preserving reconciliation

The recovery branch incorporated Incident B through two-parent merge commit `ac2f021ebc8b244e89f8f9e9ac17c07018be2e5f` with parents:

- `31869f3f970eb1cde310623a6555c752144103d0`, the recovery branch predecessor;
- `b3b1d21ca0bf1f6929b155f188551de7e9977ee4`, the Incident B tip and then-current `main`.

No force push, history rewrite, or source dropping was used. Later recovery commits may supersede this merge as the branch tip, but its two-parent ancestry preserves both histories.

## Executable ratification boundary

`scripts/verify-main-release-historical-ratification.mjs` is the single existing fail-closed historical verifier. The Main Release Provenance contract checks out the exact candidate with full history before running it.

The verifier now emits `fcr/main-release-historical-ratification@v2` and proves each incident independently:

1. exact reviewed-anchor tree;
2. exact incident-tip tree;
3. exact ordered first-parent direct-commit sequence;
4. exact changed-file set;
5. anchor is an ancestor of its incident tip;
6. incident tip is an ancestor of the current recovery candidate.

Aggregate receipt fields distinguish path instances from unique paths:

- incident count: 2;
- direct commits across incidents: 11;
- affected path instances: 24;
- unique affected paths across both incidents: 23.

The verifier refuses shallow history. It is an identity and scope witness only. It does not perform semantic review, create retrospective PR provenance, or grant merge/deploy authority.

## Truth-boundary repairs discovered during review

Semantic review of the ratified historical source found that `canRenderVerifiedClaim` was too permissive. The recovery therefore repairs the existing truth contract rather than ratifying a known false-green path.

The repaired gate requires all of the following before a verified claim may render green:

- claim status is `verified` and conflict-free;
- claim and evidence freshness requirements hold;
- current target matches when the claim is target-bound;
- an explicit `ClaimEvidenceLink` binds claim id, evidence id, and compatible scope;
- evidence source exactly matches the source declared by the claim unless a future separately reviewed compatibility rule says otherwise;
- `model_inference` and `founder_note` cannot independently verify;
- `exact_target_verification` must match the claim target;
- `hashed_artifact` must carry an integrity digest;
- `test_execution` must be target-bound.

Focused adversarial coverage lives in the existing `src/implant/__tests__/selfAttackContracts.test.ts`. No parallel truth framework was introduced.

## Review obligation

A clean wrapper diff alone is insufficient. Qualifying semantic review must cover both historical incident subjects and the current recovery delta:

- Incident A: `34ffe99e77455f278b437f4cfc67c76e3df59a25..027dfdd42f032a5c614c147ae9e1a824c2f506b9`, 9 commits / 22 paths;
- Incident B: `57e1ed8c2f21911d953587bfe8fe03cd92383a67..b3b1d21ca0bf1f6929b155f188551de7e9977ee4`, 2 commits / 2 paths.

Material Codex findings remain reviewer-owned until a successor-head review justifies disposition. Outdated or superseded locations do not automatically mean accepted.

## Current-base rule

Current PR base/head truth is owned by the machine-maintained PR Continuity Receipt on PR #775. This document intentionally does not treat a mutable current-main SHA as permanent authority.

The endpoint SHAs listed in Incident A and Incident B are immutable historical evidence. If `main` or the PR head moves again, predecessor CI, Playwright, semantic review, deterministic-review witness, and authority receipts expire and must be reacquired.

## Authority and product boundaries

The historical source state keeps its authority ceilings:

- FCR remains the single founder operating system;
- DeepSeek remains bounded instructor/challenger/proposal authority only;
- no model gains merge, deploy, credential, provider-mutation, or autonomous cross-project authority from this recovery;
- Friend Intake remains model-free for its current first slice;
- infrastructure monitoring remains consequence-only;
- stacked-PR refusal remains fail-closed;
- social analytics intermediaries may corroborate observation but do not create native-platform, publication, causal, or runtime authority.

## Acceptance criteria

Recovery may advance only when all of the following are true:

1. PR Continuity says the exact carrier is current with authoritative `main`;
2. the v2 historical-ratification verifier passes in the full-history Main Release Provenance lane for both incidents;
3. required exact-head CI and browser/Playwright proof are terminal green for the unchanged successor head;
4. semantic review explicitly covers both historical incident ranges plus current repairs;
5. material review findings receive reviewer-side disposition after their repairs;
6. the trusted deterministic-review witness is successfully published and independently read back for the exact current candidate where required;
7. authenticated Founder Final binds the exact current PR/base/head after freshness checks;
8. merge, if authorized, occurs through the normal PR path without bypass;
9. post-merge provenance reports truthful scope and never relabels either incident as originally PR-merged;
10. deployment and production-runtime equivalence remain separate claims with separate evidence.

## Separate blockers

### Trusted review credential

The trusted deterministic-review publisher previously failed before witness publication because the GitHub Actions `production` environment `APP_PRIVATE_KEY`, mapped to runtime `GITHUB_PRIVATE_KEY`, did not contain a complete supported RSA private-key PEM.

That configuration defect is separate from historical ratification. Never place the private key in this repository, PR, issue, log, artifact, or chat.

### Neon preview branch

The PR preview workflow repeatedly validates local Neon configuration and expiration setup, then fails at the external `Create Neon Branch` step. Unless a shared source cause is proven, that remains a separate provider-preview failure and is not release-ratification proof.

## Non-claims

This receipt does not claim that:

- either direct-main incident has been retroactively converted into PR merges;
- DeepSeek has live provider credentials or repository mutation authority;
- social analytics intermediaries have native-platform or causal authority;
- production serves the recovery candidate;
- the GitHub App private-key configuration is repaired;
- the Neon preview branch exists;
- merge authority is true.

Proof before claim.
