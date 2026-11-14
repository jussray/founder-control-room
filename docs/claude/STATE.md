# Claude session state — Founder Control Room

## 2026-11-14 — Production deploy blocked: Cloudflare API token invalid

- REALITY: #1092 merged as `0e85256d`. Juss approved `deploy.yml` on main `0e85256d` (approval ID `juss-2026-11-14-api-redeploy`). Run 43551157647 failed in the "Production Authority and Exact-Head Gate" job: Cloudflare returned `Invalid access token [code: 9109]` for the `CLOUDFLARE_API_TOKEN` secret in the GitHub "production" environment. The gate reported no secret value read or printed and no provider mutation. Supabase migrations, Worker deploy and Pages release never started.
- ROOT CAUSE of the live 503: the bot-dispatched deploy run 43319795155 (2026-11-12, main `aedd5650`) failed the same way. With an invalid token no deploy can reach the API Worker `founder-control-room`, which is why it has not changed since 2026-10-20 and the Pages proxy still returns 503 `API_SERVICE_IDENTITY_MISMATCH`.
- PROOF: live check 2026-11-14 ~03:10Z — `/` 200; `/version`, `/health`, `/api/health` 503 `API_SERVICE_IDENTITY_MISMATCH`. Main CI on `0e85256d`: 14 workflows completed, all success.
- PENDING MIGRATION: `20261113193000_johnstown_ai_pilot_workflow.sql` (additive: one new RLS-enabled table, service_role select/insert/update only). The deploy's `supabase db push --include-all` dry run will list any older unapplied migrations.
- NEXT GATE: Juss rotates `CLOUDFLARE_API_TOKEN` (Workers scripts edit + Pages edit on the account) in the GitHub "production" environment, and optionally re-stores `APP_PRIVATE_KEY` as a full PEM. Then rerun `deploy.yml` — the existing approval covers main `0e85256d` only; any main movement needs a fresh SHA-bound line.

## 2026-11-13 — Lint fix implanted on #1092 (main's Johnstown commit)

- REALITY: main `4461992e` (Johnstown 90-day pilot workflow) added `src/http/routes/johnstownAiPilot.ts` with an unused `EVIDENCE` constant. Lint fails on it (`@typescript-eslint/no-unused-vars`), so every PR merging this main inherits a red Lint check.
- FIX (implant rule): branch `docs/state-969-merge-20261112`. Deleted the one unused line. POST always inserts `evidence_state: 'unknown'`, and the migration's CHECK constraint enforces the allowed values, so behavior is unchanged.
- PROOF: `npx eslint src/http/routes/johnstownAiPilot.ts --quiet` clean; `tsc --noEmit` clean. Exact-head CI pending.
- ROLLBACK: revert the commit.
- SUPERSEDED (2026-11-14): main `cc9707d3` (#1096) removed the same constant, so after merging main the PR no longer changes `johnstownAiPilot.ts`. Ledger re-bound to `cc9707d3`. Juss enabled auto-merge (squash) on #1092.

## 2026-11-12 — PR #969 merged; production API degraded (pre-existing)

- REALITY: #969 was squash-merged as `6d7e9b4636d913b96abb605ebab1fcc19ed6ae1e` from head `b16f857c` on base `023f94bc`. All 31 review threads were verified and resolved first. Merge approval was "1-3" (an item naming the exact SHAs), confirmed afterwards by Juss's literal SHA-bound line. Future merges wait for the literal line.
- PROOF: CI on `6d7e9b46` shows 39 passed, 15 skipped, 2 failed. Cloudflare Pages reports "Deployed successfully" and Workers Builds reports success.
- RISK (pre-existing, not #969):
  - "Juss & Co portfolio evidence sync" fails on every main run since at least `aa1199d1` (2026-11-08) with `APP_PRIVATE_KEY_SHAPE_INVALID`: the secret has no BEGIN/END lines. Its GitHub environment is named "production", so it shows as a failed "production" deployment.
  - `verify-pair-contract` stays red until Chief `main` restores the pair contract. Chief is still `99d3b7c3`.
  - Live API is degraded: `foundercontrolroom.org` `/version`, `/health` and `/api/health` return 503 with `API_SERVICE_IDENTITY_MISMATCH`. The Pages proxy (`public/_worker.js`) requires `x-founder-control-room-service: founder-control-room`, and the upstream does not send it. Cloudflare deployment history shows the API Worker `founder-control-room` was last deployed 2026-10-20, so neither #969 nor its branch builds changed it. The home page returns 200.
- STATE: MERGED_UNVERIFIED. The live API cannot be verified while the identity check fails. Production Playwright Exact-SHA Witness was skipped.
- NEXT GATE: Juss decides on an API Worker redeploy (`deploy.yml`) or a binding fix, re-stores `APP_PRIVATE_KEY` as a full PEM, and lands the Chief restore.

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
