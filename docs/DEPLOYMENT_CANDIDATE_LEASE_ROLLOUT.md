# Deployment Candidate Lease — Portfolio Rollout

## North Star

Keep exact-SHA proof authority while eliminating false invalidation caused only by non-deploying repository drift.

## Standard

Every production-capable repository adopts:

1. an exact approved candidate SHA;
2. candidate-ancestor check against current `main`;
3. a repo-local `.deployment-authority.json` safe-drift allowlist;
4. unknown-path fail-closed behavior;
5. deploy/checkouts bound to the candidate SHA;
6. production proof bound to the candidate SHA;
7. a receipt recording candidate, observed current main, policy, safe drift, deployment identity, and successor/rollback lineage.

## Reference status

| Repository | Current status | Next gate |
|---|---|---|
| `jussray/sync-party-game` | IMPLEMENTED + CI/RUNTIME VERIFIED | production deployment proof |
| `jussray/founder-control-room` | CONTRACT + GUARD STAGED on `fix/deployment-candidate-lease` | wire authority gate after branch CI/review |
| `jussray/Sekret-Bip` | exact-head authority patterns detected | classify deploy-safe paths before wiring |
| `jussray/chief-ai-machine` | exact-SHA proof/runtime patterns detected | distinguish proof identity from deploy authority before wiring |
| `jussray/StoryEngine` | exact-SHA Playwright/runtime patterns detected | audit deployment workflow before wiring |
| `jussray/promptos` | expected-head staging patterns detected | audit public-site deploy inputs before wiring |
| `jussray/jussbeautifulhair-site` | exact-SHA production readback patterns detected | audit Shopify/Cloudflare deployment inputs before wiring |
| `jussray/untold-stories-storefront` | exact-head PR continuity law detected | audit launch/deploy authority before wiring |

## Non-negotiable safety rule

Do not copy `safe_drift_globs` between repositories blindly. Safe drift is a property of that repository's actual build/deploy graph.

For example, `docs/**` is safe in FCR only because its Pages packaging reads from `public/`, while other projects may publish documentation directly.

## Drop-in authority gate

After checking out the exact approved candidate with full history:

```bash
ACTUAL_HEAD_SHA="$(git rev-parse HEAD)"
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
CURRENT_MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"

test "$ACTUAL_HEAD_SHA" = "$EXPECTED_HEAD_SHA"
python scripts/deploy_candidate_guard.py "$EXPECTED_HEAD_SHA" "$CURRENT_MAIN_SHA"
```

Do **not** require `CURRENT_MAIN_SHA == EXPECTED_HEAD_SHA` once the lease guard is installed.

## What revokes a lease

- runtime/source changes
- dependency or lockfile changes
- migration changes
- deploy/workflow changes
- authority/security policy changes
- build/packaging changes
- unknown paths
- candidate no longer being an ancestor of main
- failed production proof
- explicit founder revocation or rollback

## What may preserve a lease

Only paths explicitly proven and allowlisted as non-deploying for that repository, such as bounded audit/receipt documentation that is not part of the shipped artifact.
