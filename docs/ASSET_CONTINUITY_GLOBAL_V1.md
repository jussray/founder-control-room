# Asset Continuity Global V1

Status: founder-approved portfolio invariant candidate
Authority repository: `jussray/founder-control-room`
Scope: every governed project; mandatory for any project with user-facing visuals, canonical graphics, recurring characters, brand assets, product imagery, motion graphics, or other identity-bearing assets

## Core invariant

A project is not visually continuous merely because its copy, layout, palette, or CSS tokens remain similar.

**The project identity must survive at the asset layer.**

For identity-bearing work, continuity evidence must preserve the actual visual objects and asset families that make the project recognizable: hero art, people, characters, environments, logos and wordmarks, icon systems, illustration families, photography treatment, motion graphics, foreground/midground/background composition, materials, motifs, and approved source references.

A future implementation that keeps the colors but replaces the canonical assets with generic substitutes is a continuity regression.

## Recognition test

For a visual project, perform the following challenge:

> Hide the copy and partially strip styling. Can a reviewer still identify the project or surface from its asset composition, characters, imagery, materials, motifs, and motion language?

If the answer is no, asset continuity is not proven.

This is a design/identity test only. It does not replace functional, accessibility, security, privacy, deployment, runtime, or user-outcome proof.

## Required asset continuity record

Each governed project must maintain a repository-local asset continuity manifest at the project-defined path recorded in `config/asset-continuity.portfolio.json` whenever it has identity-bearing assets.

The manifest must be machine-readable JSON and must distinguish at least:

- `canonical`: identity-bearing assets whose substitution can materially change project identity;
- `supporting`: assets that reinforce the world but may be replaced inside bounded rules;
- `derived`: responsive, cropped, compressed, animated, recolored, or otherwise transformed outputs derived from a canonical/supporting source.

Each canonical asset record must state:

- stable asset ID;
- asset kind and role;
- source authority and provenance;
- local path or external provider reference;
- continuity fingerprint;
- permitted transformations;
- prohibited substitutions;
- replacement policy;
- runtime references or surfaces where it is expected to appear;
- accessibility/semantic role when applicable;
- invalidation conditions;
- status (`current`, `historical`, `stale`, `superseded`, `external-reference`, or `blocked`).

For local binary/text assets, a content hash should be recorded when practical. A hash proves byte identity only. It does **not** prove semantic or compositional fidelity.

## Graphic continuity dimensions

Visual continuity review must explicitly evaluate the dimensions that apply:

1. **Composition**: hero layout, subject placement, overlap, crop, focal hierarchy, environmental depth.
2. **Asset family**: the actual people/characters/objects/illustrations/images used, not merely similar replacements.
3. **Character identity**: silhouette, styling, pose language, recurring props, expression family, and role.
4. **Logo/wordmark treatment**: material, dimensionality, outline, distortion, gradient, lockup, and placement.
5. **Lighting**: direction, temperature, contrast, glow sources, environmental spill, cinematic treatment.
6. **Material language**: chrome, neon, glass, plush, paper, cloth, cosmic glow, hand-drawn ink, or other project-specific material grammar.
7. **Motifs**: doodles, hearts, grids, stars, arrows, scribbles, stage lights, particles, stickers, texture, or other recurring marks.
8. **Iconography/UI assets**: icon family, badges, avatars, cards, pictograms, and controls that contribute identity.
9. **Typography as graphic asset**: oversized display treatments, custom shapes, outlines, stacking, 3D/chrome effects, not just font-family.
10. **Motion language**: reveal choreography, transitions, ambient loops, particles, character movement, scanner sweeps, timing rhythm.
11. **Photography/illustration treatment**: lens/framing, depth, grain, rendering style, retouching, camera angle, and color treatment.
12. **Foreground/midground/background structure**: scene depth itself is continuity evidence when it is part of the approved composition.

## Source-of-truth hierarchy

For visual identity, use the strongest available source in this order:

1. founder-approved source visual or canonical asset file;
2. founder-approved generated concept that has been explicitly adopted as a project reference;
3. repository-local canonical asset plus its manifest record;
4. verified runtime capture showing the canonical asset in use;
5. written visual fingerprint only when no stronger visual artifact exists.

A written description cannot silently override a stronger approved visual artifact.

## External and generated assets

Assets may live outside the repository, including Lovable, Shopify, Figma, Canva, Cloudflare, a CMS, object storage, or another provider.

For an external canonical asset, the manifest must record:

- provider/surface;
- stable reference when available;
- what makes the asset identity-bearing;
- expected runtime location;
- whether the raw asset is portable/exported;
- current verification status;
- fallback/rollback behavior.

Generated assets must retain enough provenance to reproduce or intentionally replace them without pretending a text description is the original artifact. Where the original binary is not repository-owned, mark that limitation explicitly.

## Replacement policy

Canonical asset replacement is not ordinary cleanup.

A replacement must answer:

- Is the asset still performing the same identity role?
- Does it preserve composition, character/object identity, material/lighting grammar, and emotional function where those are canonical?
- Is the new asset an approved evolution or a generic substitution?
- What evidence compares source and replacement?
- What is the rollback asset/path?

Replacing a canonical project image with a generic gradient, stock visual, random icon, unrelated character, or merely color-matched substitute is a regression unless the founder explicitly approves the identity change.

## Runtime proof

For a user-facing visual change, source presence is not runtime proof.

Where practical, verify:

- canonical asset path or provider reference resolves;
- expected asset is actually rendered on the intended surface;
- no generic fallback silently replaced it;
- source and rendered implementation are the same intended state;
- key responsive variants preserve identity;
- reduced-motion behavior preserves identity without depending on animation;
- changed visual paths pass Playwright or equivalent browser proof.

For highly graphic surfaces, screenshot comparison or human visual review remains necessary. Hashes, DOM selectors, and automated tests cannot by themselves prove artistic fidelity.

## Cross-project anti-collapse rule

Projects may share portfolio DNA, but canonical assets and graphic grammar must not drift into accidental sameness.

A future change that causes two distinct products to become recognizable only by text labels, while their hero assets, characters, imagery, motion, and composition collapse into one generic template, is an asset continuity regression.

Shared primitives are allowed. Shared identity by accident is not.

## Failure classes

Use these classifications:

- `ASSET_MISSING`: manifest expects a local/runtime asset that is absent.
- `ASSET_HASH_DRIFT`: local asset bytes changed without corresponding manifest update.
- `ASSET_SOURCE_STALE`: external/source reference is no longer current or cannot be re-observed.
- `GRAPHIC_CONTINUITY_REGRESSION`: recognizable identity was weakened or replaced by generic/substitute graphics.
- `COMPOSITION_DRIFT`: canonical scene structure materially changed without approval.
- `CHARACTER_DRIFT`: recurring character identity materially changed without approval.
- `MOTION_DRIFT`: canonical motion/reveal grammar was replaced by generic animation.
- `CROSS_PROJECT_COLLAPSE`: distinct projects converged into the same graphic system beyond approved shared DNA.
- `PROVENANCE_UNKNOWN`: source/licensing/generation history is insufficient for a canonical claim.
- `RUNTIME_ASSET_UNKNOWN`: source is known but current rendered use is unverified.

## Authority and evidence boundary

Asset continuity evidence never grants merge, deploy, publish, spend, provider mutation, licensing, or destructive authority.

A canonical manifest is instruction/evidence. It does not prove the runtime still renders the asset. A screenshot proves a rendered state at a moment. It does not prove the repository source, licensing, accessibility, or current provider state. Keep those evidence planes separate.

## Rollback

Every canonical replacement must preserve a rollback path: predecessor asset ID/path/provider ref plus the exact evidence that identified the previous state.

Never delete visual provenance merely because a new asset is current. Mark the predecessor `historical` or `superseded` and preserve enough information to understand what changed.

## Adoption rule

`skills/asset-continuity/SKILL.md` is the operational gate. `config/asset-continuity.portfolio.json` is the portfolio rollout registry. `scripts/verify-asset-continuity.mjs` verifies that all governed repositories are classified and that registry entries satisfy the contract shape.

Project-local rules may strengthen this invariant. They may not weaken the requirement that identity-bearing visuals survive at asset level.