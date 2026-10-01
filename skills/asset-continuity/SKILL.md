---
name: asset-continuity
version: 1.0.0
status: active-candidate
scope: portfolio
owners:
  - founder
---

# Asset Continuity Gate

## Load when

Use this skill for any work that can change a project's identity-bearing assets or visual continuity, including:

- hero art, people, recurring characters, product imagery, photography, illustrations, avatars;
- logos, wordmarks, icon families, badges, custom graphic typography;
- scene composition, foreground/midground/background structure, lighting/material treatment;
- motion graphics, reveal choreography, particles, animated identity elements;
- visual redesigns, image-to-code, URL-to-code, screenshot replication, generated art adoption;
- provider-hosted visual assets in Lovable, Shopify, Figma, Canva, CMS/object storage, Cloudflare, or similar systems.

Read `docs/ASSET_CONTINUITY_GLOBAL_V1.md` first.

## Core rule

A visual change is not continuous merely because palette, copy, or layout are similar.

Identity-bearing assets must survive at the asset layer. Treat founder-approved visual source artifacts as evidence, not inspiration that can be replaced with generic substitutes.

## Required evidence before implementation

For each affected visual surface:

1. identify the strongest approved visual source or canonical asset;
2. locate the project asset continuity manifest path from `config/asset-continuity.portfolio.json`;
3. identify canonical assets and their roles;
4. identify what is allowed to transform and what may not be substituted;
5. identify current rendered/runtime evidence when available;
6. classify missing or stale evidence explicitly.

If an identity-bearing visual has no source artifact or manifest record, the visual continuity state is `BLOCKED` or `RESEARCH_ONLY`, not automatically safe to redesign.

## Manifest contract

A project-local manifest must distinguish `canonical`, `supporting`, and `derived` assets.

For canonical assets, record at minimum:

- `id`
- `kind`
- `role`
- `continuityClass`
- `sourceAuthority`
- `provenance`
- `location`
- `fingerprint`
- `allowedTransformations`
- `prohibitedSubstitutions`
- `replacementPolicy`
- `runtimeRefs`
- `invalidationConditions`
- `status`

Use a content hash for local files when practical, but never treat the hash as proof of semantic/compositional fidelity.

## Attack pass

Before changing an identity-bearing asset, attack these failure modes:

- color-match masquerading as fidelity;
- generic gradient replacing hero art;
- stock/random person replacing a canonical character or friend-group scene;
- random SVG/icon replacing a canonical host/mascot;
- correct file existing but no longer rendered;
- stale provider reference or deleted external source;
- responsive crop destroying the focal composition;
- reduced-motion fallback removing the identity entirely;
- generated replacement losing the approved character/object identity;
- CSS-only recreation dropping texture/material/depth;
- one portfolio project's asset grammar leaking into another;
- a new asset being impossible to reproduce, export, license, or roll back;
- manifest path/hash updated without source-vs-render visual review;
- runtime fallback silently displaying a generic asset after load failure.

## Implementation rule

Preserve project identity in this order:

1. canonical source artifact;
2. composition and subject identity;
3. material/lighting/motif grammar;
4. responsive/derived variants;
5. motion language;
6. layout/copy integration.

Do not invert this into `CSS first, assets later` for a graphics-led surface.

## Verification

For visual changes, verify separately:

### Source
- manifest parses;
- canonical local paths exist;
- expected hashes match when declared;
- external references are marked current/unknown accurately;
- provenance and replacement policy are present.

### Runtime
- expected canonical asset is actually rendered;
- no generic fallback replaced it;
- key responsive states preserve identity;
- reduced-motion state preserves the visual world;
- Playwright or equivalent browser proof runs for changed user-facing paths where applicable.

### Human visual review
- compare the rendered implementation with the approved source visual;
- evaluate composition, asset family, character identity, material, lighting, motifs, typography-as-graphic, scene depth, and motion;
- use `GRAPHIC_CONTINUITY_REGRESSION` when a technically valid implementation visually collapses the identity.

Automated checks cannot self-certify artistic fidelity.

## Cross-project rule

A shared portfolio aesthetic does not authorize asset cloning across products.

If two projects can only be distinguished after reading their labels, run `CROSS_PROJECT_COLLAPSE` review.

## Output

Report:

```text
ASSET CONTINUITY
Source authority:
Manifest:
Canonical assets affected:
Source evidence:
Runtime evidence:
Graphic continuity result: PASSED | BLOCKED | REGRESSION | RESEARCH_ONLY
Failure classes:
Rollback:
Next gate:
```

## Authority boundary

This gate can block a visual change or produce a bounded repair proposal. It cannot authorize merge, deploy, publication, spending, provider mutation, licensing decisions, destructive deletion, or replacement of a founder-approved canonical asset by itself.