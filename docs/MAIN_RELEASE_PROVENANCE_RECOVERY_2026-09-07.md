# Main Release Provenance Recovery — 2026-09-07

## Current truth

At this recovery boundary, authoritative `main` is:

`bee281fc109f5231340da51998a58722bc90fc37`

`Main Release Provenance` correctly classifies that head as `direct_or_unproven_main_commit` because it is not the merge commit of a reviewed pull request.

The last reviewed merge boundary before the current direct-main interval is:

`3dbff157c5b51eb631c6d45398b2478e2ccb9143` — GitHub-signed merge commit for PR #754.

The compare range `3dbff157c5b51eb631c6d45398b2478e2ccb9143...bee281fc109f5231340da51998a58722bc90fc37` is 15 commits ahead and 0 behind.

## Direct-main incident interval

The following 15 commits are historical repository facts and are not rewritten, deleted, squashed away, relabeled as reviewed, or treated as having inherited PR approval:

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

These commits are primarily bounded Access/stranger-path/Chief Access diagnostics and tests. Their technical usefulness does not convert them into reviewed release provenance.

Historical truth is immutable. Current truth must be re-observed.

## Separate provider truth

A check-only Chief ProofMode Access recovery run on exact FCR authority head `bee281fc109f5231340da51998a58722bc90fc37` produced a sanitized provider receipt with:

- state: `blocked`
- reason: `service-token-binding-missing`
- mutation performed: `false`

That provider diagnosis is evidence only. This recovery PR does not bind a service token, mutate Cloudflare Access, deploy Chief, run a production release, or claim browser/runtime proof.

## Recovery

This pull request is release-truth-only. Its purpose is to restore a reviewed current `main` head through the repository's normal pull-request path while preserving the direct-main interval as historical evidence.

This pull request:

- adds this recovery receipt only;
- does not modify `scripts/verify-main-release-provenance.mjs`;
- does not weaken provenance, review, continuity, security, or status-check requirements;
- does not change product/runtime behavior;
- does not modify Cloudflare, Supabase, n8n, Jira, Shopify, StoryEngine, Chief, or any other provider;
- does not grant authority to any other open carrier;
- does not inherit exact-head green proof from any predecessor SHA.

## Acceptance criteria

Recovery is complete only when all of the following are true:

1. this branch remains based on the authoritative `main@bee281fc109f5231340da51998a58722bc90fc37` at merge-gate evaluation, or is reacquired history-preservingly if `main` moves;
2. fresh required exact-head CI for the final PR head is terminal and green;
3. current review/governance requirements are independently satisfied without bypass;
4. this pull request is merged through the normal repository merge path;
5. the resulting new `main` SHA is the merge commit associated with exactly this merged pull request;
6. `Main Release Provenance` runs against that exact new `main` SHA and returns `reviewed_pr_merge_provenance`;
7. deployment, provider, runtime, browser, and external-outcome claims remain separate and require their own current evidence.

Any base/head movement expires present-tense proof and merge authority.

## Authority ceiling

- `merge_authority: false`
- `deploy_authority: false`
- `provider_mutation_authority: false`
- `cloudflare_access_repair_authority: false`
- `database_mutation_authority: false`
- `publication_authority: false`

## Rollback

Close this PR unmerged, or revert this documentation-only commit if it is later integrated. No provider, production, database, credential, deployment, publication, billing, or external state is changed by this recovery carrier.

## Next gate

Freeze the exact PR head and reacquire the full exact-head machine matrix plus current review/governance truth. Do not merge from historical proof and do not repair the Chief service-token binding until a provenance-clean FCR authority root exists and provider mutation is separately authorized.
