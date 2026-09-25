# Approved Screen Live-Surface Reconciliation — 2026-09-24

## Goal
Make the already-approved user-facing visual directions visible on their correct live surfaces without creating another product island or touching the wrong commerce store.

## Authority map
- Founder Control Room: `jussray/founder-control-room`
- Truth Weaver / COUNSEL: `jussray/truth-weaver` + Lovable project `8ef43cd3-8d93-4494-a685-59ce0f795614`
- FCR Shopify identity: `vercel-store-93a908b0-wcrkkq76.myshopify.com` / branded domain `foundercontrolroom.org`
- JBH `jussbeautifulhair.com` is explicitly out of scope for COUNSEL.

## Approved references in scope
- FCR User View / Founder View
- FCR post-login onboarding / Control Room setup
- Truth Weaver COUNSEL storefront direction
- Truth Weaver + COUNSEL + FCR + Shopify system path

The FCR / ULTRATHINK Video Creation OS infographic is promotional content and is excluded from app-screen implementation.

## Reconciliation strategy
Reuse existing FCR PR #847 as the carrier rather than opening a new PR. Reacquire the visual/user-space files on current `main` while preserving unrelated current-main runtime/governance work. Require fresh exact-head CI and Playwright proof after the carrier moves.

Truth Weaver is GitHub-synced to Lovable. The COUNSEL visual direction is applied on Truth Weaver `main`, then published through the existing Lovable project. Existing local-first decision-test behavior and non-authorizing receipt semantics remain required.

## Truth states
- SOURCE IMPLEMENTED: requires exact source readback.
- DEPLOYED: requires provider deployment receipt.
- RUNTIME VERIFIED: requires real-browser evidence against the deployed target.
- OUTCOME VERIFIED: requires a real external-user outcome and is not implied by deployment.

## Rollback
- FCR: revert/close the focused PR carrier before merge, or revert its focused merge after integration.
- Truth Weaver: revert the exact UI commit and redeploy the previous Lovable revision.

## Stop condition
Do not call the work done until the live FCR and Truth Weaver user-facing paths match the intended screens and Playwright/browser proof is current for the same deployed revisions.
