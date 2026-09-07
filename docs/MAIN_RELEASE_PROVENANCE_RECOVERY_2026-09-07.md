# Main Release Provenance Recovery — 2026-09-07

## Current truth

Authoritative `main` is:

`9afd4f5da0f8307266d846ec34bf5d678634a78d`

That SHA is the GitHub-signed squash merge commit for PR #735. Its tree contains the exact intended three-file Founder Content / Visual Wonder slice that was reconciled onto the then-current main before merge.

That source fact does **not** establish reviewed merge authorization.

Historical truth is immutable. Current truth must be re-observed.

## Earlier direct-main incident interval

Before PR #735 merged, the repository carried a 15-commit direct-main interval after the last then-observed reviewed merge boundary `3dbff157c5b51eb631c6d45398b2478e2ccb9143` for PR #754:

1. `470b080918b5c489fd1802206bfbb9c4a63cc13d` — `fix(access): verify public bypass by semantics`
2. `575be7d6daece5c160c5e1507b1a32417dc4696c` — `fix(access): expose bounded review reason`
3. `8b333f6122fe174e94433ed7ff3ddbe6624e75f0` — `fix(access): accept Cloudflare apex whole-site semantics`
4. `3d2ffafd357ac2f07b69162894c636edb1807a23` — `fix(access): prove stranger containment independently`
5. `ef9fedb111438c3aefb04cbc40e733363d7ea87d` — `fix(access): align bridge contract with stranger proof`
6. `b8984b0b8a57e4a491905d18a1b7ca70c7571a0e` — `fix(access): probe canonical stranger path after apex failure`
7. `5f013e459f8fa07d55994647ee183c10d606d8ab` — `fix(access): align canonical probe contract`
8. `0059e5d873354105d331c3fec95405468e7804c9` — `fix(access): expose bounded destination shape`
9. `752ce2a42a5b4d795b7051108e58bf6ee8744cb1` — `test(access): guard bounded destination shape`
10. `89b319e8ce350bb83d3a020cd336a2b8ab29ae35` — `fix(access): expose bounded destination profile`
11. `d7eccf57239c60129fba53ee3c34a5137df4d311` — `fix(access): preserve bounded Chief check blocker`
12. `5fbca2307229474b3c5e729873901ef3319085fd` — `test(access): guard bounded destination profile`
13. `c8e6f70f68e43574928fa17f2e16cef09a2373d5` — `fix(access): publish bounded Chief blocker code`
14. `143f2f694c3e29c806102b1eb054399cb5bedc27` — `test(access): classify Chief read blockers safely`
15. `bee281fc109f5231340da51998a58722bc90fc37` — `test(access): require bounded blocked receipt projection`

Those commits remain historical facts. Their technical usefulness does not manufacture review provenance.

## PR #735 merge-boundary incident

PR #735 was reconciled history-preservingly onto `main@bee281fc109f5231340da51998a58722bc90fc37`. The effective candidate diff collapsed to exactly three files and fresh exact-head source proof began on candidate `7832cf08eeeaa590398972ac28b731e377ce6e48`.

The pull request already had GitHub auto-merge enabled by the repository owner with squash as the merge method. Once reconciliation made the pull request mergeable, GitHub merged it automatically at `9afd4f5da0f8307266d846ec34bf5d678634a78d` while the PR continuity receipt still stated `merge_authority: false` and the exact-head proof wave was still being observed.

The reconciliation operation did not itself call a merge action and did not enable auto-merge. The defect is that provider state permitted an already-armed merge to cross the source authority boundary.

Post-merge evidence then split across gates:

- exact-main CI and Playwright succeeded;
- `Main Release Provenance` succeeded;
- the post-merge PR Continuity workflow failed;
- Cloudflare Workers / Pages integration checks executed automatically for the merged source;
- no canonical manual `Deploy` workflow receipt has been established here for `9afd4f5...`;
- no independent production `/version` exact-SHA witness has been established here.

Therefore source and provider execution evidence exist, while exact public runtime identity and outcome remain unverified.

## Provenance semantic defect

Before this recovery, `scripts/verify-main-release-provenance.mjs` accepted one merged pull request associated with exact current `main` and returned:

`reviewed_pr_merge_provenance`

The classifier did not inspect reviews, exact-head approval, unresolved review threads, merge-authority receipts, auto-merge state, founder override receipts, or provider ruleset enforcement. The word `reviewed` therefore exceeded the evidence actually evaluated.

## Source repair on PR #764

This carrier narrows that machine claim without weakening the provenance check:

- exact current-main association with exactly one merged PR remains required;
- direct or unproven main commits still fail closed;
- ambiguous PR provenance still fails closed;
- stale target still fails closed;
- successful classification is renamed to `pr_merge_provenance`;
- the receipt explicitly records `evidenceScope: pr_merge_only`;
- the receipt explicitly records `reviewAuthority: not_evaluated`;
- the receipt explicitly records `mergeAuthorization: not_evaluated`;
- adversarial tests require a PR association to remain incapable of impersonating reviewed provenance.

This is a provenance-classifier repair, not a provider merge-membrane repair.

## Separate provider governance

Issue #418 remains the authority lane for the actual GitHub provider merge membrane, including independent approval, final-head binding, stale-approval dismissal, review-thread resolution, strict required checks, and bypass/admin behavior.

This PR does not mutate GitHub rulesets, branch protection, Cloudflare, Supabase, n8n, Jira, Shopify, StoryEngine, Chief, credentials, secrets, billing, publication state, or production runtime.

Ordinary conversation commands such as `approved`, `merge`, `continue`, `cont`, or `audit` are not a founder manual-merge override receipt.

## Acceptance criteria

This source recovery is acceptable only when all of the following remain true:

1. PR #764 is reacquired against exact authoritative `main@9afd4f5da0f8307266d846ec34bf5d678634a78d`, or reacquired again if main moves;
2. fresh required exact-head CI for the final PR head is terminal and green;
3. the provenance verifier returns `pr_merge_provenance` only for exactly one merged PR bound to exact current main;
4. the verifier does not claim review or merge authorization from PR association alone;
5. current review/governance requirements are independently satisfied without bypass before any merge of this carrier;
6. auto-merge remains unarmed unless separately and explicitly authorized;
7. provider merge-membrane truth remains separately owned by issue #418;
8. deployment, runtime, browser, and external-outcome claims remain separate and require their own current evidence.

Any base/head movement expires present-tense proof and merge authority.

## Authority ceiling

- `merge_authority: false`
- `deploy_authority: false`
- `provider_mutation_authority: false`
- `cloudflare_access_repair_authority: false`
- `database_mutation_authority: false`
- `publication_authority: false`

## Rollback

Close PR #764 unmerged or revert its source-only provenance correction if later integrated. No provider or production mutation is required to roll back this carrier.

## Next gate

Freeze the final #764 head, reacquire exact-head machine proof plus current review/governance truth, and keep merge authority false. Provider ruleset repair and production deployment remain separate authorized operations.
