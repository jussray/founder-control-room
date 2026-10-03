# Media Storyboard Start-Frame Contract v1

## Purpose

Founder Control Room treats images and video as one governed media-production system rather than separate creative islands.

Images establish approved visual state. Video moves from or between those states.

A storyboard therefore may not rely only on prose when an approved visual-state asset exists. `/MAKEVIDEO` must be able to bind a real registered image as frame zero before provider routing.

## Core invariant

> **Image first-state → storyboard continuity → video motion.**

For a storyboard-bound video shot:

1. the canonical opening frame is a registered image asset;
2. the image belongs to the same workspace/project boundary, or has explicit reusable-across-project authority;
3. revoked, quarantined, and archived assets cannot establish frame zero;
4. the opening frame is the first reference passed into the media-routing request;
5. the request requires reference fidelity;
6. Media Router keeps provider choice replaceable;
7. because the request now carries references, the existing router selects `video.image_to_video` rather than `video.text_to_video` when the provider catalog supports it;
8. the storyboard state receives a deterministic fingerprint and continuity cookie;
9. `/MAKEVIDEO` combines its director-plan fingerprint with the storyboard fingerprint, so a changed frame zero invalidates the combined continuity identity.

## Typed visual-state inputs

`StoryboardStartFrameBindingV1` provides these semantic inputs:

- `openingFrameAssetId`
- optional `endFrameAssetId`
- `characterReferenceAssetIds`
- `environmentReferenceAssetIds`
- `productReferenceAssetIds`
- `styleReferenceAssetIds`
- `continuityReferenceAssetIds`

The Media Router still receives its provider-neutral `referenceAssetIds` array. The storyboard contract preserves the richer semantic meaning before flattening those assets into the router boundary.

This avoids turning provider-specific reference conventions into FCR authority.

## `/MAKEVIDEO` bridge

`compileMakeVideoStoryboardBundle(...)` composes:

- the existing `/MAKEVIDEO` director plan;
- the approved storyboard start-frame binding;
- the prepared Media Router request/context;
- one combined continuity fingerprint and cookie.

The combined identity changes when either the director plan or storyboard visual state changes.

A continuity fingerprint or cookie is evidence only. It does not grant provider, release, publication, or commercial-rights authority.

## Why this exists

Without an explicit frame-zero asset, a text storyboard can describe a scene while every renderer independently reinvents the first visual state. That creates avoidable drift in:

- character identity;
- wardrobe;
- product appearance;
- environment geometry;
- camera framing;
- lighting;
- composition;
- visual brand language.

This contract narrows that freedom at the correct layer. Creative motion remains provider-replaceable while the approved starting state remains stable.

## Truth boundary

This contract proves only that FCR can bind approved image state into a provider-neutral video-routing request.

It does **not** prove that any specific renderer is currently connected, funded, licensed, callable, or capable of generating the requested output. Live provider capability remains runtime evidence.

It also does not turn generated world footage into product/runtime proof. Real product behavior still requires the appropriate runtime evidence path, including Playwright where applicable.

## Verification

The focused contract tests must prove:

1. frame zero must exist and be an image;
2. unusable visual-state assets fail closed;
3. frame zero is first in the reference list;
4. reference fidelity is required;
5. provider routing can use the existing image-to-video capability path;
6. storyboard continuity receives a deterministic fingerprint/cookie;
7. changing frame zero changes the storyboard fingerprint;
8. changing frame zero changes the combined `/MAKEVIDEO` continuity identity.

## Rollback

The implementation is additive. Rollback removes:

- `src/lib/mediaStoryboardStartFrame.ts`
- `src/lib/makeVideoStoryboardBridge.ts`
- their focused tests
- this document

No provider calls, releases, publication actions, database migrations, or runtime deployments are performed by this contract change.
