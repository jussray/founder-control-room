# Open PR triage — 2026-11-09

Status: **HISTORICAL evidence snapshot**. Observed against `main` = `b22cbfeb2ab82fc790e76a58d43ee73e0f4c5e82`. Any movement of `main` or a PR head invalidates the row. This file authorizes nothing.

## Method

- Open PRs listed via GitHub provider (119: 89 ready-for-review, 30 draft).
- Each head fetched locally; `git merge-tree --write-tree main head` for conflict status; `rev-list --count` for behind/ahead; `git diff --name-only merge-base..head` for net files.
- CI read only for #1079 (freshest).

## Summary

| Class | Count |
|---|---|
| Conflicts with current main | 81 |
| Merges cleanly (textually) | 38 |
| Net-empty diff (already absorbed by main → close as superseded) | 4 |
| ≤1 commit behind main | 4 |

Textually clean ≠ mergeable: the strict-freshness ruleset requires every candidate to be updated to current main and re-run `Required Gate` on its exact head, and `docs/FOUNDER_MERGE_AUTHORITY.md` requires per-PR founder approval bound to exact PR/base/head.

## Notable findings

- **#1079** (1 behind): `Required Gate` red on head `87af0ba8`. Causes reproduced: (a) Documentation Truth `DOCUMENTATION_TRUTH_BASE_NOT_ANCESTOR` — base moved from `aa1199d` to `b22cbfe` (#1077) after the PR was cut; (b) Repo Reality — PR body missing Scope/Verification/Evidence/Limits/Rollback sections. It also edits the merge consumer (`src/http/routes/approvals.ts`), i.e. a trust-root change that cannot certify itself.
- **#969** (1 behind, 36 files, +3479): large skills drop; needs real review, not a bulk merge.
- **#797** delegates merge/deploy authority to Codex/Claude. An AI must not merge a PR granting itself authority; founder-only decision.
- **Likely duplicate clusters** (inferred from titles/branches; confirm diffs, then keep one survivor each): StoryEngine peer pin (#1003, #945, #915, #892, #884, #1043); Cloudflare token-shape diagnostic (#865, #926); residual trust boundaries #521 (#841, #845); ULTRATHINK skills (#967, #969); Anthropic secret contract (#891, #893); rollback/credential receipts (#959, #960, #972); front door (#837, #970, #1002, #769).
- **#804** is 2582 commits ahead — branch history is broken/unrelated; do not merge.

## Per-PR ledger

| PR | Draft | Merge vs main | Behind | Ahead | Net files | Title |
|---|---|---|---|---|---|---|
| #1079 | draft | clean | 1 | 1 | 2 | fix(governance): re-verify reviewed base before FCR integration |
| #1076 |  | CONFLICT | 94 | 12 | 5 | fix(ci): surface red predecessor runs and current-head uncertainty |
| #1075 |  | CONFLICT | 96 | 8 | 5 | fix(reconcile): accept Wrangler notice-prefixed secret receipts safely |
| #1074 |  | clean | 96 | 9 | 5 | fix(mcp): enforce exact Worker secret registry sections |
| #1073 | draft | CONFLICT | 96 | 6 | 3 | fix(pages): validate required HTML and local assets before Cloudflare release |
| #1069 |  | CONFLICT | 96 | 11 | 7 | ci(deploy): restore continue-on-error on post-deploy reconcile |
| #1064 |  | CONFLICT | 95 | 15 | 6 | feat(supabase): governed content system data layer (queue, receipts, metrics) |
| #1063 |  | CONFLICT | 104 | 5 | 39 | Export Juss-authored skills, linear rebuild (review only; merge gated) |
| #1061 |  | clean | 94 | 32 | 15 | fix: align GitHub App key parsing and clarify secret-shape failures |
| #1060 |  | CONFLICT | 96 | 32 | 48 | Fix/fcr welcome entry 20261103 |
| #1055 |  | CONFLICT | 96 | 66 | 46 | feat(canon): add hash-linked last-verified knowledge reducer |
| #1051 |  | clean | 101 | 12 | 3 | ci: automatically track project adapter drift without promoting unreviewed contracts |
| #1046 |  | CONFLICT | 101 | 14 | 16 | fix(shopify): route Founder Proof Audit to the correct FCR product page |
| #1043 |  | clean | 96 | 19 | 7 | fix: enforce FCR merge peer freshness and refresh StoryEngine witness |
| #1042 |  | clean | 96 | 7 | 1 | ci: manually runnable Founder Home Playwright proof |
| #1041 |  | clean | 96 | 5 | 1 | test: reject relay authority smuggling from untrusted content |
| #1032 |  | CONFLICT | 104 | 17 | 6 | config: recognize checkout.foundercontrolroom.org browser origin |
| #1029 |  | CONFLICT | 505 | 3 | 6 | fix(adapter-freshness): refresh audited sibling contract pins to live mains |
| #1027 |  | CONFLICT | 42 | 111 | 40 | feat(fse): add MCP-native multi-platform media campaign and reputation review |
| #1018 |  | clean | 94 | 14 | 2 | docs(guards): record verified Supabase source-observation boundary |
| #1016 |  | CONFLICT | 101 | 14 | 15 | security: require founder Sauce Guard for agents and changed logging |
| #1007 |  | CONFLICT | 104 | 43 | 19 | feat(release): fail-closed three-repository portfolio manifest foundation |
| #1006 |  | clean | 94 | 74 | 28 | FCR Browser Operator v1: first-party synthetic browser journeys (no TinyFish) |
| #1005 |  | CONFLICT | 1 | 22 | 7 | fix: allow adapter evidence promotion only on exact-head verified contracts |
| #1003 |  | clean | 104 | 6 | 0 | docs(playwright): reconcile StoryEngine peer truth on current main |
| #1002 |  | CONFLICT | 94 | 63 | 26 | Protect FCR owner control-room paths without hiding public site |
| #989 |  | clean | 96 | 16 | 6 | feat(actual-flow): add isolated offline FCR signed-evidence proof gate |
| #988 | draft | CONFLICT | 101 | 31 | 26 | fix(security): restore least privilege to portfolio evidence sync |
| #985 |  | CONFLICT | 645 | 26 | 9 | fix(proof): independently verify Cloudflare state before external ledger revalidation |
| #982 |  | CONFLICT | 1 | 11 | 9 | fix(supabase): reconcile applied history and current-main SQL lint |
| #980 | draft | clean | 104 | 9 | 3 | security: RFC 9116 disclosure with exact-release browser proof |
| #979 |  | CONFLICT | 649 | 24 | 22 | fix(fcr): recognize Protect Me and repair release-proof blockers |
| #977 |  | CONFLICT | 651 | 13 | 12 | feat(billing): $1 JussCo intro guard + causal CI recovery, never JBH |
| #976 |  | CONFLICT | 651 | 27 | 15 | feat(operator): add four-system goal execution contract and adversarial tests |
| #975 |  | clean | 96 | 27 | 9 | fix(security): gate Slack alerts, reconcile secrets and repair JSON proof |
| #974 |  | clean | 201 | 15 | 1 | fix(security): reconcile live FCR reconciliation-events RLS hotfix |
| #973 |  | clean | 201 | 9 | 11 | fix(security): deny restricted operator relays before every adapter |
| #972 |  | CONFLICT | 652 | 9 | 14 | fix(deploy): retain credential audit receipts and gate Worker reconcile |
| #971 | draft | CONFLICT | 651 | 1 | 5 | fix(runtime-state): real newline in receipt writer |
| #970 |  | clean | 104 | 39 | 4 | fix(site): serve approved-mockup-v3 front door, not founder-os-v2 |
| #969 |  | clean | 1 | 81 | 36 | feat(skills): roll forward ULTRATHINK suite and URLFIX repair loop |
| #968 | draft | clean | 104 | 4 | 0 | test(approvals): align patch fixtures with idempotency reservation |
| #967 |  | CONFLICT | 104 | 8 | 19 | feat(skills): add ULTRATHINK companions and URLFIX repair loop |
| #966 |  | CONFLICT | 80 | 155 | 12 | docs: reconcile documentation truth for a14ee2e goalfix, worker, and access-membrane changes |
| #965 | draft | CONFLICT | 104 | 40 | 17 | docs(goalfix): bounded ULTRATHINK execution and proof outcomes |
| #960 | draft | CONFLICT | 406 | 3 | 5 | ci(deploy): record a rollback receipt when a deploy-plane job fails |
| #959 | draft | CONFLICT | 406 | 3 | 6 | ci(deploy): upload credential audit receipts on every run |
| #955 | draft | CONFLICT | 226 | 6 | 5 | feat(v10): governed voice intent for existing Council Round |
| #954 | draft | clean | 104 | 4 | 1 | docs(skills): FCR-scoped FutureYou/Me V10 adapter |
| #953 |  | CONFLICT | 671 | 17 | 9 | security: add FCR vulnerability disclosure policy and security.txt |
| #951 | draft | clean | 204 | 24 | 4 | test: capture live FCR desktop/mobile visual evidence |
| #950 |  | CONFLICT | 96 | 21 | 23 | ci(test): require every discovered Vitest test to execute |
| #949 | draft | clean | 104 | 3 | 2 | council: address Ultrathink Council Bus backing + fcr adapter pointer |
| #947 | draft | CONFLICT | 500 | 27 | 7 | feat(economics): add governed Action Cost Ledger V1 |
| #945 | draft | clean | 104 | 17 | 2 | fix(playwright): bind repaired StoryEngine federation peer |
| #944 |  | CONFLICT | 651 | 43 | 17 | fix(market): bind Council outcomes to independent verifier proof |
| #942 | draft | clean | 104 | 22 | 4 | fix(ci): reconcile Neon preview cleanup on PR close |
| #932 | draft | clean | 104 | 22 | 26 | fix(relay): align peer truth plane with canonical registry |
| #931 |  | CONFLICT | 104 | 20 | 5 | feat(media): wire governed remote graphic render capability |
| #930 |  | CONFLICT | 104 | 16 | 6 | fix(governance): keep capital policy evaluator non-authorizing |
| #928 | draft | clean | 104 | 101 | 3 | fix(relay): reject non-completed OpenAI output |
| #926 |  | clean | 201 | 3 | 3 | fix(release): add secret-safe Cloudflare deploy-token shape diagnostic (reacquired on current main, 20261005) |
| #917 | draft | CONFLICT | 732 | 49 | 46 | feat(fcr-commerce): add Whop payment witness |
| #915 | draft | CONFLICT | 406 | 19 | 4 | fix(playwright): allow proven StoryEngine non-runtime drift |
| #914 | draft | clean | 104 | 88 | 14 | feat(urlfix): governed URL/runtime diagnosis and proof lane |
| #910 | draft | clean | 104 | 33 | 6 | feat(authority): stage canonical founder action receipts |
| #907 | draft | clean | 104 | 45 | 3 | fix(snapshot): publish failure evidence and stop dropping queued runs |
| #906 | draft | clean | 104 | 17 | 9 | feat(design): enforce portfolio asset continuity |
| #905 | draft | clean | 104 | 8 | 3 | feat(ci): Juss & Co status sync from each world's live repo state |
| #904 | draft | clean | 94 | 34 | 3 | fix(snapshot): bind external site readback to exact evidence subject |
| #898 | draft | CONFLICT | 104 | 97 | 8 | fix(mcp): re-check advertised tool risk before execution |
| #897 |  | CONFLICT | 732 | 6 | 5 | fix(governance): bind portfolio actions to active authority tiers |
| #894 |  | CONFLICT | 204 | 22 | 6 | feat(portfolio): run Monday founder orientation through FCR |
| #893 |  | clean | 94 | 26 | 0 | docs(env): declare Anthropic Worker secret name |
| #892 |  | clean | 94 | 25 | 0 | test(federation): refresh StoryEngine peer pin |
| #891 |  | clean | 94 | 4 | 1 | test(providers): reconcile Anthropic Worker secret contract |
| #890 |  | clean | 94 | 4 | 1 | docs(mcp): reconcile Manus operator portfolio scope |
| #887 |  | CONFLICT | 737 | 8 | 8 | fix(sync): complete FCR portfolio governance coverage |
| #885 |  | CONFLICT | 737 | 8 | 5 | feat(growth): read SYNC first-party player outcomes in FCR |
| #884 |  | CONFLICT | 676 | 2830 | 8 | Repair/pr817 storyengine peer e2473a |
| #883 |  | CONFLICT | 595 | 176 | 15 | fix: close exact-head truth false greens |
| #881 |  | CONFLICT | 78 | 2943 | 10 | feat(mobile): add read-only native founder client |
| #880 |  | CONFLICT | 683 | 2843 | 4 | fix(portfolio): record mobile store intent separately from authority |
| #879 | draft | CONFLICT | 88 | 2910 | 3 | feat(ai): add model-native Sol and Claude execution profiles |
| #877 |  | CONFLICT | 88 | 2843 | 5 | feat(council): route StoryEngine through three-domain creative Court |
| #876 | draft | CONFLICT | 688 | 2874 | 211 | ci(authority): harden continuity and retire expired Claude permissions |
| #875 | draft | CONFLICT | 688 | 2838 | 174 | fix: bind Claude Playwright use to explicit receipts |
| #871 |  | CONFLICT | 688 | 2820 | 165 | ci: prove FCR OpenAI binding from live runtime first |
| #869 |  | CONFLICT | 78 | 2817 | 5 | fix: make remote MCP OAuth compatible with Supabase |
| #865 |  | CONFLICT | 78 | 2873 | 2 | fix(release): reacquire Cloudflare token-shape diagnostic on current main |
| #857 |  | CONFLICT | 728 | 48 | 23 | fix(github): support async stacked PR merges |
| #852 |  | CONFLICT | 639 | 39 | 28 | feat(github-app): make installation authority capability-aware |
| #849 |  | CONFLICT | 758 | 2 | 9 | fix(proof): decouple read-only exact-SHA production witness |
| #848 |  | clean | 94 | 6 | 4 | fix(l99): reconcile StoryEngine Git connection identity |
| #845 |  | CONFLICT | 698 | 2784 | 71 | fix(security): close three residual trust boundaries from #521 |
| #844 |  | CONFLICT | 78 | 2777 | 2 | fix(command-bridge): bind executed state to proof-eligible read receipt |
| #843 |  | CONFLICT | 698 | 2739 | 50 | fix(jbh): require receipt ingest binding in production preflight |
| #841 |  | CONFLICT | 698 | 2736 | 48 | fix(security): close residual founder trust-boundary leaks |
| #840 |  | CONFLICT | 753 | 5 | 9 | fix(relay): separate Gemini readiness from FCR deploy authority |
| #839 |  | CONFLICT | 753 | 57 | 62 | fix(johnstown): bind AI Center execution to current City Hall evidence |
| #837 |  | CONFLICT | 688 | 2847 | 182 | feat(ui): make FCR User and Founder views the live public front door |
| #833 |  | CONFLICT | 714 | 237 | 110 | fix(ux): hide founder stack until authenticated |
| #829 |  | CONFLICT | 94 | 29 | 8 | fix(surfaces): bind Lovable projects to canonical repos |
| #827 |  | CONFLICT | 401 | 264 | 17 | fix(proofmode): harden Chief Access repair authority |
| #821 |  | CONFLICT | 197 | 369 | 17 | fix(relay): harden peer bridge and transport truth |
| #818 |  | CONFLICT | 104 | 91 | 27 | fix(authority): bind execution to project shell boundary |
| #808 |  | CONFLICT | 748 | 2524 | 6 | fix(review): bind trusted witness to live main |
| #806 | draft | CONFLICT | 508 | 2554 | 22 | fix(relay): prove signed federated relay v3.1 on current exact main |
| #804 |  | clean | 94 | 2582 | 2 | fix(n8n): add founder-only conveyor probe command bridge |
| #800 | draft | CONFLICT | 739 | 2644 | 73 | fix(supabase): restore production migration ledger source |
| #797 |  | CONFLICT | 739 | 63 | 9 | feat(authority): delegate bounded merge and deploy authority to Codex Chat and Claude |
| #784 |  | CONFLICT | 85 | 2913 | 33 | feat(fcr): establish workspace tenancy and Chief first-run Composer |
| #781 |  | CONFLICT | 701 | 2814 | 18 | fix(pair): enforce standalone FCR ↔ Chief peer contract |
| #779 |  | CONFLICT | 708 | 87 | 6 | fix(governance): plan producer-correct Chief ruleset reconciliation |
| #776 | draft | CONFLICT | 42 | 98 | 33 | feat(friend): governed runtime models + privacy-safe intake v1 (fresh exact-main replay) |
| #775 |  | CONFLICT | 686 | 251 | 17 | fix(release): ratify direct-main provenance range |
| #774 |  | CONFLICT | 715 | 105 | 27 | feat(friend-intake): wire deterministic first slice |
| #769 |  | CONFLICT | 593 | 22 | 58 | fix(access): keep FCR public front door and protect live API |
| #730 |  | CONFLICT | 763 | 2872 | 1258 | fix(n8n): verify provider-native founder content readback |
