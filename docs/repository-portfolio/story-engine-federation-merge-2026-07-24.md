# Story Engine federation merge evidence

Date: 2026-07-24
Authority: Founder Control Room
Repository: `jussray/l99-StoryEngine`

## REALITY

Founder Control Room PR #21 is the canonical provider-neutral repository verification and signed runner-packet path. The historical L99-only OIDC observer was intentionally superseded because a second observation channel would split provenance and duplicate evidence semantics.

Founder Control Room ledger PR #133 merged at `2fc0459c987aabc01a667a08f718c1893f5124be` and recorded the decision as `SUPERSEDE_AND_REBUILD`.

## FIX MERGED

Story Engine pull request: `#40`
Title: Align Story Engine with Founder Control Room federation
Branch: `fix/federated-control-room-current-main`
Exact reviewed head: `fae54fdcc4f4d61ea3ad815fe01dea25b8ba11a3`
Merge commit: `fd0884ce761dfc5b62eabb5cd380a83a22aa9c5a`

The merge:

- preserved every previously declared L99 capability;
- preserved the stable visible provider-check identity `Promotion gates`;
- changed the declared promotion entrypoint to `python runtime/promotion_gates_all.py`;
- declared `cookie-free-auth-transport` evidence;
- declared `founder-control-room-federation` evidence;
- marked the historical root manifest `retired-direct-observer`;
- pointed historical builders to `.control-room/repository.manifest.json`;
- replaced the legacy direct OIDC workflow with a permanently skipped retirement stub;
- removed OIDC-token and external-POST authority from the historical workflow;
- added `runtime/control_room_contract.py`;
- registered `control_room_federation` in the full promotion registry;
- added negative tests for stale entrypoints, restored OIDC authority, and the pre-rename repository identity.

No signed runner packet, Founder Control Room database mutation, deployment, DNS change, credential rotation, story publication, migration, or destructive write occurred through the merge.

## EXACT-HEAD PROOF

Source review on `fae54fdcc4f4d61ea3ad815fe01dea25b8ba11a3` confirmed:

- seven focused changed files;
- canonical project ID `l99` and repository `jussray/l99-StoryEngine`;
- existing capabilities preserved;
- relative evidence paths and bounded single-line usage markers;
- stable required check name `Promotion gates` matching the GitHub job name;
- full registry registration for `cookie_contract` and `control_room_federation`;
- historical workflow limited to `contents: read` and `if: false`;
- no `id-token: write`, GitHub OIDC environment variables, receiver URL, `curl`, or external POST in the retired workflow;
- historical root manifest points to the canonical federation manifest.

Fallback execution:

- isolated schema-equivalent federation tests: 4 passed, 0 failed;
- positive federation contract: zero errors;
- stale `promotion_gates.py` entrypoint mutation: rejected;
- restored `id-token: write` mutation: rejected;
- stale `jussray/l99-` identity mutation: rejected;
- Python contract/test compilation: passed;
- historical root manifest passed its exact Node validation contract.

Inherited unchanged authentication proof from Story Engine PR #38:

- Node authentication tests: 6 passed, 0 failed;
- explicit `x-api-key`: passed;
- Bearer authentication: passed;
- cookie-only credential: rejected with `401`;
- higher-privilege cookie could not replace an explicit lower-privilege header identity;
- cookie contract and syntax checks: passed.

## HOSTED CI CLASSIFICATION

PR #40 final-head runs:

| Workflow | Run | Job | Evidence | Classification |
|---|---:|---:|---|---|
| L99 Promotion Gates | `30136516475` | `89621391180` | `steps: null`, no logs | `runner_startup_failure` |
| L99 Promotion Gates retry | `30136516475` | `89621728766` | `steps: null`, no logs | `runner_startup_failure` |
| Control Room Manifest | `30136516544` | `89621391399` | `steps: null`, no logs | `runner_startup_failure` |

These failures remain red infrastructure evidence. They are not represented as green and are not classified as code, manifest, Python, Node, or application regressions.

The available commit-to-workflow query returned no pull-request-associated workflow records for merge commit `fd0884ce761dfc5b62eabb5cd380a83a22aa9c5a`. That does not prove that no push workflow exists; it means no post-merge execution result is currently available through this evidence channel.

## STALE PATHS RETIRED

- Story Engine PR #18: closed as superseded; branch and review history preserved.
- Story Engine PR #39: closed as architecturally superseded; branch, exporter work, tests, and review history preserved.
- No branch was deleted.

## FOUNDER CONTROL ROOM DECISION

Status: `INTEGRATED_PENDING_SIGNED_VERIFICATION`

The repository architecture and local evidence contract are integrated. Completion is not claimed because Founder Control Room has not yet recorded an exact-main provider-neutral signed verification packet or equivalent exact-ref inspection for merge commit `fd0884ce761dfc5b62eabb5cd380a83a22aa9c5a`.

## RISK

- Browser-readable session key storage remains a production blocker despite the closed cookie-auth boundary.
- GitHub-hosted Story Engine runner provisioning remains unreliable.
- A provider-neutral verification record proves bounded repository evidence, not deployment, tenant-safe identity, creator/operator separation, user outcomes, or production release readiness.
- Cloudflare evidence was not involved and remains separate.

## ROLLBACK

- Revert Story Engine merge commit `fd0884ce761dfc5b62eabb5cd380a83a22aa9c5a` only with explicit rollback approval.
- The retired direct workflow remains in Git history but has no execution or OIDC authority on merged `main`.
- No external-system cleanup is currently required.

## NEXT GATE

1. Run or observe the provider-neutral Founder Control Room verifier against exact merge commit `fd0884ce761dfc5b62eabb5cd380a83a22aa9c5a`.
2. Capture repository, branch, exact SHA, manifest hash, check identity, capability observations, usage-assertion results, signature/provenance state, and provider details URL.
3. Keep any zero-step/no-log GitHub failure classified as `runner_startup_failure`.
4. Do not mark Story Engine release-ready until tenant-safe identity, browser credential replacement, creator/operator separation, and applicable runtime evidence are independently proven.
