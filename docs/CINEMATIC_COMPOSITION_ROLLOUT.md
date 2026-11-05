# Cinematic Composition Contract — Staged Rollout Receipt

Date recorded: 2026-11-04 (America/New_York)
Founder request: One cohesive cinematic composition across every app, page, website, and agent.

## Evidence boundary

Observed through authenticated GitHub connector file readback on the named draft branches; this is not independent runtime, deployed app, browser screenshot, CI, PR review, merge, or production evidence.

- **Canonical draft:** `jussray/founder-control-room` branch `feat/cinematic-composition-contract-20261104`, `skills/cinematic-composition/SKILL.md`, linked from `AGENTS.md`. Both files read back.
- **Additional draft agent entrypoints with verified `AGENTS.md` rule:** `jussray/chief-ai-machine`, `jussray/promptos`, `jussray/Sekret-Bip`, `jussray/jbh-private`, `jussray/Sekret-Bip-Parents`, `jussray/truth-compass`, `jussray/truth-weaver`, `jussray/jussray`, `jussray/solcontinuity`, `jussray/THINK-TANK`, `jussray/Bleeding-Ink`, `jussray/juss-protect-me`, `jussray/juss-protect-me-2`, `jussray/StoryEngine`, and `jussray/sekret-bip-companions`.
- **Additional staged Claude entrypoints:** Chief AI, Se'kret Bip, jussray, THINK-TANK, and StoryEngine. Readback confirmed for these files, though no live agent process was observed consuming them.
- All listed branches are named `feat/cinematic-composition-contract-20261104`. No new PR, merge, deploy, public publication, or UI source redesign was performed in this rollout.

## Coverage accounting

GitHub returned 50 repositories for the selected owner, one archived. 16 repositories (including FCR) had the design instruction staged and their `AGENTS.md` file read back; 33 other unarchived repositories were **not** modified or audited for this standard. Treat this coverage as *staged instruction files only*.

## What still needs implementation

1. Review and authorize the exact candidate branch/head independently for each repository.
2. Resolve the canonical contract dependency in the release target; staging a cross-repo pointer is not installing a shared skill into every runtime.
3. Verify which agent processes actually load AGENTS.md, CLAUDE.md, an installed skill, or a different prompt registry. Explicitly integrate the rule in each existing runtime rather than assuming inheritance.
4. Audit the existing design system and exact user journey for each site/app. Apply route-level component, token, scene, responsive, and interaction fixes only after scoped design review.
5. Collect exact-head Playwright/browser screenshots, interaction tests, keyboard/reduced-motion/accessibility evidence, performance and release readback before marking a page or app verified.
6. Keep merger, deployment, publication, privacy, auth, and founder authority separate. No permanent auto-deploy or auto-merge authority is granted.

This receipt is a dated snapshot. New source heads, evidence, design references, approvals or deployments supersede its currentness.
