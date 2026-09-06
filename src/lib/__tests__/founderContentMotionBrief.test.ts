import { describe, expect, it } from 'vitest';
import {
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
