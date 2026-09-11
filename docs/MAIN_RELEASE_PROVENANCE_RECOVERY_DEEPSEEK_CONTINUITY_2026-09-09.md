# Main Release Provenance Recovery - Multi-Incident Ratification - 2026-09-09

## Reality

PR #775 is a forward provenance-recovery carrier. It does not rewrite repository history and it does not claim that direct commits were originally merged through pull requests.

Three direct-main incidents are now in scope because `main` continued to move while this recovery was being reviewed.

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

Incident B is a separate provenance interval and must not be hidden merely by rebasing or merging a future PR over it. Its overlap with later recovery files is historical context only; the current effective recovery delta is measured independently below.

## Incident C - direct main after PR #778

A later clean GitHub merge established a new reviewed anchor:

- commit `f4e0439da4f43ef980e10eaf39b75e8d6bff21f8`, merge commit for PR #778;
- tree `8f881059b8bb40a460c274bcdedcf2ae502f2420`.

After that merge, `main` advanced through 27 commits with no intervening pull-request integration. The immutable Incident C tip now observed is:

- commit `2007eb07087aff46064188f694949ef410c235a9`;
- tree `ed1eda84855a3a166169a5420f44755e753a08cf`.

Exact first-parent sequence, 27 commits:

1. `61411a7651c1589738ba88b20a11937f22003343`
2. `2e346a8dbb55fbd423d2ebd7c817f091c5f10924`
3. `bfe78a978ddc0a2a9fc9bc60fd43f464a39806d9`
4. `e0ac4576da3d66436be67731220d6b63acf838b3`
5. `d99f7f639c89cdff7e7d9ba6c9f76723f1b58f41`
6. `62358663d1215d8bd3df4dba2faee1ee2b0a0bab`
7. `4af3109e3f84f2dc8f19a8ec159b6ebe037ea758`
8. `24c457fbfcf8406487c1504cf34cd2b4278049ab`
9. `dd740ecaceb684bb0478ecffd8778dba0deb0d53`
10. `fb72627ab351c70feb0afbf2c3c3959903c48aa1`
11. `0bfe2dfddeded56e7629b57ead9a9562e0842834`
12. `0130111347a74386ddc0fb1ae7f1099ccb8ab8b9`
13. `55ed2c22e213768f4e8ae9912e186c72e2948020`
14. `622ab1d3e37b5e5aefa6343427fa5378f9dc83cf`
15. `625704f8d75e076ef9c30b20214b280a30f618b3`
16. `c6611b08176ef887a61ea3ef0b7cafab443c1402`
17. `612159e876051eb05493e50af9562899b60a6bd6`
18. `81d05f7ae8f427e84db506cfa726520a8178dece`
19. `f9f1d671cfb701925b90c2c5a7cd21efe4ab294f`
20. `6dd040c6421663c72050cf3db63042320072096c`
21. `6f16c62470e5f33b20da630d076acd4c09281325`
22. `86c93735a5a0f68ca698ee60680ae055242f0968`
23. `d9c333d9566c0f9389a72612f832a2a622fc33f7`
24. `2b0a65a47703178a1c880c4e055b5a3127f922d5`
25. `da99d38cf3b43596cac3bd2ec43621a5a62be416`
26. `d47ac0c8e164a2842d1ff1717f605924beba6556`
27. `2007eb07087aff46064188f694949ef410c235a9`

Exact affected set, 21 paths:

- `.agents/skills/control-room-cloudflare-agent-fleet/SKILL.md`
- `.control-room/plugin-management.json`
- `.github/mcp.json`
- `.github/workflows/capability-contract.yml`
- `docs/FCR_SINGLE_OS_COHESION_AUDIT.md`
- `e2e/security-posture-proof.mjs`
- `public/control-room/security.css`
- `public/control-room/security.js`
- `scripts/verify-ai-skill-contract.mjs`
- `scripts/verify-founder-intelligence-inheritance.mjs`
- `skills/portfolio-control-plane/SKILL.md`
- `src/capabilities/__tests__/workbenchRegistry.test.ts`
- `src/capabilities/freeFirstCapabilityPolicy.ts`
- `src/capabilities/workbenchRegistry.ts`
- `src/founder-os-lab/__tests__/pluginManagement.contract.test.ts`
- `src/http/routes/securityPosture.test.ts`
- `src/security/cryptographicInventory.ts`
- `src/security/securityPosture.test.ts`
- `src/security/securityPosture.ts`
- `src/security/strategicSecurity.test.ts`
- `src/security/strategicSecurity.ts`

Incident C spans portfolio audit rules, social-analytics configuration, security backend, security browser UI, browser proof, Cloudflare MCP routing, the public/private route invariant, the shared FCR capability runtime, and free-first capability selection. It must not be summarized as only a crypto-UI or voice-runtime incident.

`81d05f7a...`, `6dd040c6...`, and `da99d38c...` remain immutable intermediate Incident C snapshots. `2007eb07...` is the latest observed Incident C tip. None is permanent present-tense authority: if `main` advances again without an intervening PR integration, another explicit Incident C extension must be observed rather than silently donating authority to the old endpoint.

## History-preserving reconciliation

The recovery branch incorporated Incident B through two-parent merge commit `ac2f021ebc8b244e89f8f9e9ac17c07018be2e5f` with parents:

- `31869f3f970eb1cde310623a6555c752144103d0`, the recovery branch predecessor;
- `b3b1d21ca0bf1f6929b155f188551de7e9977ee4`, the Incident B tip and then-current `main`.

The recovery branch initially incorporated Incident C through two-parent merge commit `d145f1645a6e433a928cf832297f068a208e0294` with parents:

- `31497239ba169df33a8cf35dad33815eedd95cb0`, the recovery branch predecessor;
- `81d05f7ae8f427e84db506cfa726520a8178dece`, the then-observed Incident C tip.

After Incident C extended by two more direct-main commits, the recovery branch incorporated that extension through two-parent merge commit `0df0bb272581d6f0d0e78488036bd0bac05fdeeb` with parents:

- `b49be8de550b17fda383daaf095714e5990e92c4`, the recovery branch predecessor;
- `6dd040c6421663c72050cf3db63042320072096c`, the extended Incident C tip and then-current `main`.

After the shared capability-runtime and free-first changes extended Incident C again, the existing recovery carrier incorporated exact current `main` through two-parent merge commit `6c132d3959ab1a6598c52f1c43238af4484584d7` with parents:

- `26aac78241c5e51218857664041481022a3a1d88`, the recovery branch predecessor;
- `2007eb07087aff46064188f694949ef410c235a9`, the latest observed Incident C tip and then-current `main`.

Later ratification-receipt commits descend from that merge, so recovery history and the complete observed Incident C range remain ancestors. No force push, history rewrite, or source dropping is authorized.

## Executable ratification boundary

`scripts/verify-main-release-historical-ratification.mjs` is the single existing fail-closed historical verifier. The Main Release Provenance contract checks out the exact candidate with full history before running it.

The verifier emits `fcr/main-release-historical-ratification@v2` and proves each incident independently:

1. exact reviewed-anchor tree;
2. exact incident-tip tree;
3. exact ordered first-parent direct-commit sequence;
4. exact changed-file set;
5. anchor is an ancestor of its incident tip;
6. incident tip is an ancestor of the current recovery candidate.

Aggregate receipt fields distinguish path instances from unique paths:

- incident count: 3;
- direct commits across incidents: 38;
- affected path instances: 45;
- unique affected paths across all incidents: 41.

The verifier refuses shallow history. It is an identity and scope witness only. It does not perform semantic review, create retrospective PR provenance, or grant merge/deploy authority.

## Truth-boundary repairs discovered during review

Semantic review of the ratified historical source found multiple false-fresh or false-equivalence paths. The recovery repairs the existing contracts rather than ratifying known ambiguity.

The verified-claim gate now requires all of the following before a claim may render green:

- claim status is `verified` and conflict-free;
- claim and evidence freshness requirements hold;
- current target matches when the claim is target-bound;
- an explicit `ClaimEvidenceLink` binds claim id, evidence id, and compatible scope;
- evidence source exactly matches the source declared by the claim unless a future separately reviewed compatibility rule says otherwise;
- `live_provider` evidence itself carries a valid observed-at / expiry lease and cannot borrow freshness from the claim;
- `model_inference` and `founder_note` cannot independently verify;
- `exact_target_verification` must match the claim target;
- `hashed_artifact` must carry an integrity digest;
- `test_execution` must be target-bound.

Additional review repairs keep adjacent authority boundaries fail-closed:

- DeepSeek instruction validation revalidates the source project-state packet at consumption time, so an expired packet cannot keep authorizing a proposal-only instruction merely because its fingerprint still matches;
- generic approval payload hashing accepts only plain JSON values and rejects non-plain objects such as `Date` rather than collapsing distinct semantic values into the same hash;
- cryptographic inventory records pin the exact inspected repository revision and observation lease; static source evidence becomes `STALE` when that lease expires instead of being refreshed by a new HTTP response timestamp;
- PR continuity metadata re-reads the PR, root branch tip, and actual base branch tip before PATCH and blocks if any observed identity moved.

Focused adversarial coverage remains in the existing truth/continuity tests plus narrow review-regression tests. No parallel truth framework was introduced.

## Review obligation

A clean wrapper diff alone is insufficient. Qualifying semantic review must cover all three historical incident subjects and the current recovery delta:

- Incident A: `34ffe99e77455f278b437f4cfc67c76e3df59a25..027dfdd42f032a5c614c147ae9e1a824c2f506b9`, 9 commits / 22 paths;
- Incident B: `57e1ed8c2f21911d953587bfe8fe03cd92383a67..b3b1d21ca0bf1f6929b155f188551de7e9977ee4`, 2 commits / 2 paths;
- Incident C: `f4e0439da4f43ef980e10eaf39b75e8d6bff21f8..2007eb07087aff46064188f694949ef410c235a9`, 27 commits / 21 paths;
- current effective recovery delta relative to Incident C tip: 16 paths:
  - `.github/workflows/main-release-provenance.yml`
  - `docs/MAIN_RELEASE_PROVENANCE_RECOVERY_DEEPSEEK_CONTINUITY_2026-09-09.md`
  - `docs/PR_CONTINUITY.md`
  - `scripts/pr-continuity.mjs`
  - `scripts/verify-main-release-historical-ratification.mjs`
  - `security/portfolio-worker-security.json`
  - `src/approvals/approval.ts`
  - `src/implant/__tests__/selfAttackContracts.test.ts`
  - `src/lib/__tests__/agentInterop.test.ts`
  - `src/lib/agentInterop.ts`
  - `src/security/cryptographicInventory.ts`
  - `src/security/provenanceReviewP2.test.ts`
  - `src/security/securityPosture.ts`
  - `src/truth/truth.ts`
  - `src/truth/truthFreshness.test.ts`
  - `test/pr-continuity.attack20.test.mjs`

Material review findings remain reviewer-owned until a successor-head review justifies disposition. Outdated or superseded locations do not automatically mean accepted.

## Current-base rule

Current PR base/head truth comes from a fresh live GitHub provider read of the PR plus the current root/base branch tips. The machine-maintained PR Continuity Receipt is a timestamped `snapshot_not_authority` observation only. It may corroborate a live read when identities still match, but it never outranks provider state or renews predecessor proof.

The endpoint SHAs listed in Incidents A, B, and C are immutable historical evidence. If `main` or the PR head moves again, predecessor CI, Playwright, semantic review, deterministic-review witness, and authority receipts expire and must be reacquired.

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

1. a fresh live GitHub provider read proves the exact PR head is current with the exact current `main`/base tip; a static continuity snapshot may corroborate but cannot authorize this condition;
2. the v2 historical-ratification verifier passes in the full-history Main Release Provenance lane for all three incidents;
3. required exact-head CI and browser/Playwright proof are terminal green for the unchanged successor head;
4. semantic review explicitly covers all three historical incident ranges plus the exact current recovery delta;
5. material review findings receive reviewer-side disposition after their repairs;
6. the trusted deterministic-review witness is successfully published and independently read back for the exact current candidate where required;
7. authenticated Founder Final binds the exact current PR/base/head after freshness checks;
8. merge, if authorized, occurs through the normal PR path without bypass;
9. post-merge provenance reports truthful scope and never relabels any direct-main incident as originally PR-merged;
10. deployment and production-runtime equivalence remain separate claims with separate evidence.

## Separate blockers

### Trusted review credential

The trusted deterministic-review publisher previously failed before witness publication because the GitHub Actions `production` environment `APP_PRIVATE_KEY`, mapped to runtime `GITHUB_PRIVATE_KEY`, did not contain a complete supported RSA private-key PEM.

That configuration defect is separate from historical ratification. Never place the private key in this repository, PR, issue, log, artifact, or chat.

### Provider governance topology

The canonical FCR governance contract requires two provider membranes: a founder-only pull-request/review membrane with review-thread resolution and trusted-App pull-request-only bypass, plus a separate zero-bypass strict-freshness membrane for `Required Gate` and `Verify test-ledger contract`. A legacy monolithic ruleset is not equivalent proof.

Governance reconciliation uses the same trusted App credential as deterministic witness publication. Do not attempt provider reconciliation while that credential is known invalid or before separately authorized provider mutation.

### Neon preview branch

The PR preview workflow repeatedly validates local Neon configuration and expiration setup, then fails at the external `Create Neon Branch` step. Unless a shared source cause is proven, that remains a separate provider-preview failure and is not release-ratification proof.

## Non-claims

This receipt does not claim that:

- any direct-main incident has been retroactively converted into a PR merge;
- Incident C remains the terminal current-main interval after its observed tip if `main` later moves;
- DeepSeek has live provider credentials or repository mutation authority;
- social analytics intermediaries have native-platform or causal authority;
- production serves the recovery candidate;
- the GitHub App private-key configuration is repaired;
- canonical GitHub governance has been reconciled;
- the Neon preview branch exists;
- merge authority is true.

Proof before claim.
