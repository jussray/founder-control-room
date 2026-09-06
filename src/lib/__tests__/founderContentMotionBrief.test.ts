import { describe, expect, it } from 'vitest';
import {
  ATTACK_3000_LENSES,
  createFounderContentMotionBrief,
  rendererForFounderContentMotionLevel,
  selectFounderContentMotionLevel,
} from '../founderContentMotionBrief.js';

describe('founder content MotionBrief', () => {
  it('uses the lowest sufficient deterministic motion level', () => {
    expect(selectFounderContentMotionLevel({})).toBe(0);
    expect(selectFounderContentMotionLevel({ cameraMotionRequired: true })).toBe(1);
    expect(selectFounderContentMotionLevel({ cameraMotionRequired: true, layerMotionRequired: true })).toBe(2);
    expect(selectFounderContentMotionLevel({ layerMotionRequired: true, composedCinemaRequired: true })).toBe(3);
    expect(rendererForFounderContentMotionLevel(0)).toBe('static');
    expect(rendererForFounderContentMotionLevel(1)).toBe('ffmpeg');
    expect(rendererForFounderContentMotionLevel(2)).toBe('ffmpeg');
    expect(rendererForFounderContentMotionLevel(3)).toBe('ffmpeg');
  });

  it('escalates to generative only when source pixels or the full scene must change', () => {
    const pixelMotion = createFounderContentMotionBrief({
      intent: 'wonder',
      needs: { cameraMotionRequired: true, pixelMotionRequired: true },
      selectionReason: 'The character must blink and hair must move, so deterministic camera motion cannot satisfy the scene.',
      aspectRatio: '9:16',
    });
    expect(pixelMotion.level).toBe(4);
    expect(pixelMotion.renderer).toBe('generative');
    expect(pixelMotion.requires_generative_provider).toBe(true);
    expect(pixelMotion.preserve.identity).toBe(true);
    expect(pixelMotion.reduced_motion_fallback).toBe(true);
    expect(pixelMotion.vendor_binding).toBeNull();

    const fullScene = createFounderContentMotionBrief({
      intent: 'reveal',
      needs: { pixelMotionRequired: true, fullSceneSynthesisRequired: true },
      selectionReason: 'The character, environment, and camera all require synthesized motion.',
    });
    expect(fullScene.level).toBe(5);
    expect(fullScene.renderer).toBe('generative');
  });

  it('classifies an approved-frame cinematic short before applying the motion ladder', () => {
    const brief = createFounderContentMotionBrief({
      intent: 'reveal',
      needs: { cameraMotionRequired: true },
      selectionReason: 'The approved world must become a causal multi-shot film rather than a moving poster.',
      experienceClass: 'cinematic_short',
      approvedSourceFrame: true,
      sourceFrameFingerprint: 'sha256:approved-fcr-frame',
      minimumDistinctShots: 7,
      forbidCardOverlays: true,
      aspectRatio: '9:16',
    });

    expect(brief.level).toBe(5);
    expect(brief.renderer).toBe('generative');
    expect(brief.requires_generative_provider).toBe(true);
    expect(brief.cinematic_contract).toMatchObject({
      experience_class: 'cinematic_short',
      approved_source_frame: true,
      source_frame_role: 'visual_fingerprint',
      source_frame_fingerprint: 'sha256:approved-fcr-frame',
      minimum_distinct_shots: 7,
      requires_causal_progression: true,
      requires_world_state_change: true,
      requires_payoff: true,
      forbids_motion_poster_substitution: true,
      forbidden_overlays: ['cards', 'floating_ui'],
    });
    expect(brief.cinematic_contract.continuity_cookie.required).toBe(true);
    expect(brief.cinematic_contract.continuity_cookie.stale_rejected).toBe(true);
    expect(brief.cinematic_contract.continuity_cookie.reissue_on_state_change).toBe(true);
    expect(brief.cinematic_contract.attack_3000).toEqual({
      enabled: true,
      external_test_count_claimed: false,
      lenses: ATTACK_3000_LENSES,
    });
  });

  it('refuses to treat an approved source frame as current without a fingerprint', () => {
    expect(() => createFounderContentMotionBrief({
      selectionReason: 'Use the approved source world.',
      experienceClass: 'cinematic_short',
      approvedSourceFrame: true,
    })).toThrow(/sourceFrameFingerprint is required/);
  });

  it('keeps motion-poster work cheap when a cinematic short was not requested', () => {
    const brief = createFounderContentMotionBrief({
      selectionReason: 'A restrained camera push is the intended deliverable.',
      experienceClass: 'motion_poster',
      needs: { cameraMotionRequired: true },
    });
    expect(brief.level).toBe(1);
    expect(brief.renderer).toBe('ffmpeg');
    expect(brief.cinematic_contract.forbids_motion_poster_substitution).toBe(false);
    expect(brief.cinematic_contract.attack_3000.enabled).toBe(false);
  });

  it('produces StoryEngine-compatible generic renderer fields without vendor architecture', () => {
    const brief = createFounderContentMotionBrief({
      intent: 'explanation',
      needs: { composedCinemaRequired: true },
      selectionReason: 'Timed captions, proof inserts, and scene sequencing require programmatic cinema but not regenerated source pixels.',
      focalPoint: { x: 0.42, y: 0.31 },
      intensity: 0.4,
      durationSeconds: 30,
      fps: 30,
      aspectRatio: '9:16',
    });

    expect(brief).toMatchObject({
      schema_version: '1.0.0',
      policy: 'lowest_sufficient_motion',
      intent: 'explanation',
      level: 3,
      renderer: 'ffmpeg',
      focal_point: { x: 0.42, y: 0.31 },
      intensity: 0.4,
      duration_seconds: 30,
      fps: 30,
      aspect_ratio: '9:16',
      reduced_motion_fallback: true,
      requires_generative_provider: false,
      vendor_binding: null,
    });
    expect(Object.keys(brief)).not.toContain('provider');
    expect(Object.keys(brief)).not.toContain('model');
  });

  it('clamps unsafe numeric inputs and rejects missing reasons', () => {
    const brief = createFounderContentMotionBrief({
      needs: { cameraMotionRequired: true },
      selectionReason: 'A slow push is enough to create focus without changing the still image.',
      focalPoint: { x: 9, y: -2 },
      intensity: 4,
      durationSeconds: 999,
    });
    expect(brief.focal_point).toEqual({ x: 1, y: 0 });
    expect(brief.intensity).toBe(1);
    expect(brief.duration_seconds).toBe(60);
    expect(() => createFounderContentMotionBrief({ selectionReason: '   ' })).toThrow(/selectionReason is required/);
  });
});
