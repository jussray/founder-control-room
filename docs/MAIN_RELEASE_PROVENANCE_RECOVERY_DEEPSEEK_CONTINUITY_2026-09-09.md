# Main Release Provenance Recovery — DeepSeek + Continuity — 2026-09-09

## Incident

Two focused, already-tested changes were committed directly to `main`:

- `ccc0e88d3295d42f95d7f42e0225863bdb4a3e19` — governed DeepSeek instructor interop
- `d022ef600a3ae62bef796bfde9f521b33d63d1a9` — classify stacked PR rollover refusal fail-closed

The code and browser verification for the resulting exact head were successful, but `Main Release Provenance` correctly rejected current `main@d022ef600a3ae62bef796bfde9f521b33d63d1a9` because that SHA is a direct commit rather than the merge commit of exactly one reviewed pull request into `main`.

## Historical truth

The direct commits remain immutable repository history. This recovery does not rewrite, delete, force-move, squash away, or relabel them.

This pull request exists only to restore current release provenance through the normal pull-request merge path. It does not weaken `scripts/verify-main-release-provenance.mjs` and does not manufacture retrospective PR provenance for the historical direct commits.

## Scope recovered

### DeepSeek instructor interop

The recovered source state includes the existing governed DeepSeek instructor identity and typed AI-to-AI packet boundary. DeepSeek remains instruction/proposal authority only. It is not granted implementation, merge, deploy, provider-mutation, secret, or project-mutation authority. Cross-project dispatch remains bounded by existing FCR authority and evidence gates.

### PR continuity stacked-refusal classification

The recovered source state includes the existing fail-closed classification for GitHub's stacked-PR update refusal. A stacked update refusal is represented as `BLOCKED_STACK_REBASE_REQUIRED` rather than hidden behind an opaque provider crash. The continuity helper does not force-push or silently rebase stacked branches.

## Exact-head evidence already observed

Proof subject before this recovery branch was created: `main@d022ef600a3ae62bef796bfde9f521b33d63d1a9`.

Observed exact-head evidence includes:

- CI run `34308518169`: **SUCCESS**;
- CI test job: **SUCCESS**;
- CI Playwright e2e job: **SUCCESS**;
- standalone Playwright E2E run `34308518137`: **SUCCESS**;
- Verification Core run `34308518151`: **SUCCESS**;
- Documentation Truth run `34308518148`: **SUCCESS**;
- Work Supersession Contract: **SUCCESS**;
- PR Continuity focused attack suite: **26/26 PASS** before exercising the live PR graph.

The live PR graph then remained blocked for real open-carrier conditions. The continuity receipt classified PR #769 as `BLOCKED_STACK_REBASE_REQUIRED`, kept PR #770 `CURRENT`, and preserved `authorizesMerge: false` / `authorizesDeploy: false`.

`Main Release Provenance` run `34308518218` failed with `direct_or_unproven_main_commit`. That failure is the reason for this recovery carrier and is not suppressed by this change.

## Recovery rule

This pull request is provenance-recovery-only. It adds this bounded receipt and changes no product runtime behavior.

It does **not**:

- weaken release provenance checks;
- change DeepSeek authority;
- enable live DeepSeek provider calls;
- change cross-project federation mode;
- rebase or force-push open PR stacks;
- grant merge, deploy, database, Cloudflare, Supabase, GitHub-ruleset, or secret authority;
- claim production runtime equivalence.

## Acceptance criteria

Recovery is complete only when all of the following are true:

1. this branch was created from authoritative `main@d022ef600a3ae62bef796bfde9f521b33d63d1a9` and remains current with `main` at merge-gate evaluation;
2. required exact-head CI for this pull request is terminal and green, including the repository's Playwright/browser proof where required;
3. this pull request is merged through the normal repository merge path without bypassing the repository's evidence gates;
4. the resulting new `main` SHA is the merge commit associated with exactly this merged pull request;
5. `Main Release Provenance` runs against that exact new `main` SHA and returns `reviewed_pr_merge_provenance`;
6. deployment and production-runtime claims remain separate and require their own current receipts.

If `main` moves before merge, criterion 1 expires. Reacquire current `main` and reverify before merge.

## Non-claims

This receipt does not claim that DeepSeek has been given live provider credentials, that DeepSeek can mutate repositories, that the public FCR runtime serves this source SHA, that production was deployed, or that blocked open PRs became mergeable.

Proof before claim.
