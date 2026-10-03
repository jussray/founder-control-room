# Approved Screen Live-Surface Reconciliation — 2026-09-24

## Goal
Make the already-approved user-facing visual directions visible on their correct live surfaces without creating another product island, borrowing another project's visual canon, or touching the wrong commerce store.

## Authority map
- Founder Control Room: `jussray/founder-control-room`
- Existing UI carrier: PR #847 / `fix/fcr-live-dual-view-current-main-20260920`
- Truth Weaver / COUNSEL: `jussray/truth-weaver` + Lovable project `8ef43cd3-8d93-4494-a685-59ce0f795614`
- FCR Shopify identity: `vercel-store-93a908b0-wcrkkq76.myshopify.com` / branded domain `foundercontrolroom.org`
- JBH `jussbeautifulhair.com` is explicitly out of scope for COUNSEL.

## FCR visual authority
The FCR-specific Canva design `DAHWK8B4UJk` (`Founder Control Room website`) is the visual reference for this carrier. Its operating hierarchy is the source of the current user-facing direction: `Current Reality` first, one `Next Gate`, then bounded motion, evidence, and outcome.

Se'kret Bip Canva designs and Se'kret Bip visual canon are explicitly excluded from FCR implementation. The two products keep separate identities and product boundaries.

Adobe Express references were used only as secondary layout/hierarchy research. They are not FCR identity authority and no template styling is copied into the product.

FCR visual lock:
- neutral dark command-room base rather than a generic blue-tech dashboard;
- purple = Decide / core decision;
- blue = Evidence / truth;
- orange = Act / motion;
- yellow = Outcome / learned lift;
- semantic meaning is always paired with words, never color alone;
- `Verified`, `Unknown`, and `Blocked` remain explicit truth states;
- the interface should answer `what is true now?`, `what needs attention next?`, and `what has actually been proven?` before exposing deeper machinery.

## Approved references in scope
- FCR User View / Founder View
- FCR post-login onboarding / Control Room setup
- FCR signal-to-proof command surface
- Truth Weaver COUNSEL storefront direction
- Truth Weaver + COUNSEL + FCR + Shopify system path

The FCR / ULTRATHINK Video Creation OS infographic is promotional content and is excluded from app-screen implementation.

## Focused implementation delta
PR #847 remains the carrier. No replacement PR is created.

This pass changes only the FCR public doorway, local-first user workspace, their browser contract, and this continuity receipt:
- `public/index.html` now presents FCR as a living founder operating environment with `Current Reality`, `Next Gate`, explicit truth states, and the four semantic operating lanes;
- `public/user-space.html` now behaves visually as a local control surface instead of a generic form page while preserving blank-start privacy and existing device-local storage behavior;
- `e2e/fcr-user-space-signal-loop-proof.mjs` now fails if the public FCR signal-to-proof identity, semantic lanes, command surface, or bounded next-gate behavior drifts;
- private founder authority, authentication, provider authority, module ownership, and backend contracts are unchanged by this visual slice.

## Reconciliation strategy
Reuse existing FCR PR #847 as the carrier rather than opening a new PR. Preserve unrelated current-main runtime/governance work. Require fresh exact-head CI and Playwright proof after the carrier moves.

Truth Weaver is GitHub-synced to Lovable. The COUNSEL visual direction remains on its own product surface. Existing local-first decision-test behavior and non-authorizing receipt semantics remain required.

## Truth states
- SOURCE IMPLEMENTED: requires exact source readback.
- MERGED: requires GitHub merge evidence for the exact reviewed candidate.
- DEPLOYED: requires provider deployment receipt.
- RUNTIME VERIFIED: requires real-browser evidence against the deployed target.
- OUTCOME VERIFIED: requires a real external-user outcome and is not implied by deployment.

## Rollback
- FCR before merge: close or revert the focused #847 carrier commits with zero current-main impact.
- FCR after merge: revert the focused UI/test commits; private authority/backend state requires no rollback because this slice does not mutate it.
- Truth Weaver: revert the exact UI commit and redeploy the previous Lovable revision if its separate surface changes.

## Stop condition
Do not call the FCR visual work done until exact-head Playwright verifies the public doorway and local-first user workspace at desktop/mobile on the same candidate. Do not call it live until the deployed FCR revision is independently browser-verified. Do not infer external-user outcome from source, CI, preview, or deployment success.
