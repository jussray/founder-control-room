# FCR cinematic composition — polish-first source candidate

Date: 2026-11-26 (America/New_York)

## Intent

The founder reports that the current visual direction is getting closer to the desired look but is not yet polished. **Refine what exists; do not redesign the scene, replace approved visual assets, alter the product identity, or disturb application behavior.**

## Source changes (isolated candidate branch)

- `AGENTS.md`: add a local cinematic skill read requirement for scoped visual changes.
- `skills/cinematic-composition/SKILL.md`: restore the long-form rule and add the polish-first acceptance sequence.
- `public/cinematic-direction.css`: tighten type rhythm, focus treatment, card/form continuity and mobile spacing for existing public entrance/welcome scenes.
- `public/control-room/styles.css`: tighten typography, visual rhythm, focus, touch sizing, and reduced-transparency fallback within the existing console.
- `public/member/styles.css`: matching member workspace typography, surface and focus finishing.

The approved FCR palette, existing mountain artwork, hero content, routes, copy, login, customer data, server behavior and other project source are unchanged by this candidate.

## Evidence and limitations

Authenticated GitHub file readback confirmed the staged text and styles. A scoped static check confirmed all three CSS files retain their full `main` contents as an unchanged prefix, appended CSS braces are balanced, responsive and reduced-motion rules are present, and relevant HTML entrypoints reference their existing stylesheets.

At comparison time, the branch was **5 commits ahead / 0 behind** `main`. The source-only checks are not a browser screenshot, visual parity comparison, CSS grammar certification, full test suite, accessibility audit, live provider verification, build result, or approval to deploy. No CI statuses were returned for the final style-change commit.

**Current status:** SOURCE_POLISH_STAGED / SOURCE_READBACK_VERIFIED / STATIC_SMOKE_PASS / BROWSER_VISUAL_QA_UNKNOWN / DEPLOYMENT_UNCHANGED.

## Next gates

1. Re-check exact branch head against current `main`; keep any review candidate fresh.
2. Render and inspect public entrance, welcome, Control Room and member workspace on desktop and narrow mobile. Compare to current approved FCR artwork at matching routes/states. Confirm readable text, image crop, tap sizes, focus, keyboard, reduced motion and reduced transparency.
3. Execute targeted build/browser/e2e tests on the exact head. Validate no auth, signup, navigation, accessibility, privacy or service regressions.
4. Obtain separate founder review/merge/deploy authority and required checks; never infer approval from this document.

No PR, merge, production deploy, external publication or provider configuration changes are performed by the source polish.
