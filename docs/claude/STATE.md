# Claude session state — Founder Control Room

## Standing founder rule (2026-11-11): implant needed fixes, document, Sauce Guard

Juss: "Implant the needed fixes always … even if the work branch isn't yours, just document accordingly. Use Sauce Guard when doing so."

- When a fix is needed to move founder work forward, Claude implants it on the branch being driven, whoever created that branch. Claude does not stop to ask whose branch it is.
- On a branch Claude did not create, it adds commits or merge commits only. It never rebases, amends, or force-pushes there.
- Every such fix is documented in this file, or in the owning repo's own state doc. The entry names the repo, branch, head SHA, the files changed, the reason, the proof, and the rollback.
- Sauce Guard applies to that documentation. No credentials, private prompts, raw private diffs, customer or family data, private metrics, or proprietary mechanics. Notes about a private repo stay in that repo, never in public `jussray/jussray`.
- This rule does not grant merge, deploy, publish, credential, ruleset or DNS authority. Those still need Juss's exact approval for the exact head, as `docs/FOUNDER_MERGE_AUTHORITY.md` requires.

## 2026-11-11 — PR #969 (`skills/ultrathink-suite-rollover-20261012`)

- REALITY: head `2968f143`, with `main` `6429b55f` merged in cleanly. The ledger `Base-bound` was re-bound to `6429b55f`. Juss has auto-merge (squash) on.
- PROOF (local): CI history audit tests 19/19 passed, Documentation Truth `CURRENT`, redirect cookie tests 12/12 passed. Exact-head CI is pending.
- RISK: the ledger base goes stale on every `main` move and needs a one-line re-bind each time. `verify-pair-contract` stays red until Chief `main` restores the pair contract. The Chief pair contract and capability-registry were reverted in its bulk merge on 2026-11-08, and `strategic-lens.js` was deleted.
- DEAD END: Chief branches. `git push` and the GitHub API branch create both fail. Every branch from Chief `main` inherits merge commit `531c12b7`, and the ruleset rejects any branch containing a merge commit. Restore commit `e8f5f6ca` (4 files) exists only locally.
- FIX (implant rule): StoryEngine `main` moved `1730f316` → `1a4a5816` (StoryEngine #154, adds one receipt JSON, no runtime code). The E2E peer-ref gate went red on `766f33ec` even though every browser scenario passed. Re-pinned `.github/workflows/playwright.yml` and recorded it in README, the truth receipt and `TRUTH_DECAY_AUDIT.md`. Rollback: revert the commit. This drift affects every PR and `main` until a repin lands there too.
- SUPERSEDED (2026-11-12): `main` landed the same StoryEngine `1a4a5816` repin as #1089. Merging `main` `023f94bc` into #969 took main's repin text, so #969 no longer carries its own repin. The ledger is re-bound to `023f94bc`. Merge blockers on GitHub (read from the live ruleset): unresolved review threads, and required `founder-signal-engine-review` + `production` deployments for the head. `verify-pair-contract` is not a required check.
- NEXT GATE: Juss pushes the Chief restore with a bypass-capable account, or relaxes Chief's merge-commit rule. After that, refresh the FCR adapter snapshot to the new Chief head.

## 2026-11-04 — SleepWealth account-model governance on branch (not merged)

- REALITY: branch `claude/fcr-sleepwealth-account-models` at `2ed6df87`, based on `main` `c16212e` (main unchanged as of this check). Pushed to origin as a feature branch. No PR opened, nothing merged, nothing deployed. VERIFIED by `git ls-remote` and `git rev-list --count HEAD..origin/main` = 0.
- FIX: `src/governance/portfolioGovernanceProfiles.ts` adds `customer_scope_eligibility` and `pooled_scope_eligibility` claims for `jussray/SleepWealth-Agent`. Adds blocked actions `accept-pooled-funds` and `cross-account-credential-use`. Live trading, broker enablement and ceiling increases stay blocked. A regression test is in `portfolioGovernanceProfiles.test.ts`.
- PROOF: `npx vitest run src/governance` = 118 of 118 passed, after `npm ci`. The proof covers the local branch only. Exact-head CI on the pushed head has not run.
- RISK: FCR does not yet mint the receipts the SleepWealth, SolWealth or SideShift evaluators check. The profile's `preparedAgainstBaseSha` still names `bec4e0f`, which is in history but not on current main. Live GitHub rules (required reviews, stale-review dismissal, strict status checks) are not verified by this branch.
- ROLLBACK: delete `claude/fcr-sleepwealth-account-models`, or revert `2ed6df87` on that branch. Nothing has reached `main`.
- NEXT GATE: founder decision on opening a draft PR for exact-head CI and independent review. No merge or deploy is authorized. Receipt issuance needs a separate founder-authorized FCR feature.

Last verified: 2026-10-09 (earlier content below is historical)

## Current architecture truth

**Repository state:** Main branch is clean. Latest stable build includes:
- CI setup-python pin repair (2026-10-04, commit `3b38cda`)
- Immutable GitHub Actions hardening (all actions pinned to commit SHAs)
- Portfolio evidence sync stabilization
- Compliance docs reviewed and current

**Key implemented systems:**
- Repository mutation governance (branch creation, PR continuity)
- First-party video rendering via FFmpeg adapter
- Capital control architecture (design_only state)
- FCR/Chief product boundary clarified (standalone peers)
- Mirror Engine V1 (source implemented)
- Founder-content execution with Sauce Guard
- Cloudflare production runtime binding
- GitHub App integration for evidence collection
- Supabase RLS enforcement (verified)

**Known limitations:**
- Zapier integration: source exists, not yet live with verified execution
- HubSpot integration: documented, not yet live with verified execution
- Private runner issues: historical as of October 2026 (resolved in CI cycle)
- N8N Founder Content: source-enabled only, runtime activation unverified (`N8N_FOUNDER_CONTENT_ENABLED=false`)
- Jira automation: source implemented, provider activation unverified

## Documentation status

- README.md: Current, matches implementation
- CLAUDE.md: Current, enforced
- Compliance docs: Verified current (2026-10-09, no breaking changes since 2026-07-19)
- Verification docs: Historical markers added to superseded July 2026 files
- TRUTH_DECAY_AUDIT.md: Current, includes 2026-09 corrections
- CI_SETUP_PYTHON_PIN_REPAIR_2026-10-04.md: Current

## Truth rules applied

1. Repository/code actually inspected over stale claims
2. CI state verified from current commit, not historical workflows
3. Provider bindings documented but runtime activation separately verified
4. Compliance docs marked with audit timestamp and architecture version
5. Superseded historical docs clearly marked with [SUPERSEDED] status

## Next gates requiring founder decision

None currently blocking—system is in stable operating state. Deferred work:
- Zapier / HubSpot live activation (when ready)
- N8N Founder Content runtime enablement (when configuration verified)
- Private runner infrastructure (resolved; no longer blocking)

## For next Claude session

If returning to FCR work:
1. Check jussray/jussray STATE.md for portfolio-level decisions
2. Verify exact-head CI status at current commit
3. Use TRUTH_DECAY_AUDIT.md for cross-repository drift history
4. Compliance audit cycle: re-verify every 90 days minimum
