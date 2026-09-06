import { describe, expect, it } from 'vitest';
import { capabilities } from '../workbenchRegistry.js';

describe('capability workbench registry', () => {
  it('keeps every reviewed capability complete and uniquely addressable', () => {
    const ids = capabilities.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(capabilities.length).toBeGreaterThanOrEqual(12);

    for (const capability of capabilities) {
      expect(capability.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/);
      expect(capability.inputs.length).toBeGreaterThan(0);
      expect(capability.proof.length).toBeGreaterThan(0);
      expect(capability.risk).toBeTruthy();
      expect(capability.implementation).toBeTruthy();
    }
  });

  it('requires short-form video output to carry the lowest-sufficient MotionBrief contract', () => {
    const shortForm = capabilities.find((capability) => capability.id === 'short-form-video-60s-v1');
    expect(shortForm).toBeDefined();
    expect(shortForm?.summary).toContain('lowest-sufficient MotionBrief');
    expect(shortForm?.summary).toContain('generic renderer class');
    expect(shortForm?.summary).toContain('reduced-motion fallback');
    expect(shortForm?.implementation).toContain('MotionBrief');
    expect(shortForm?.risk).toContain('cannot grant itself execution');
  });
});
