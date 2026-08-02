import { describe, expect, it } from 'vitest';
import { resolveGoalfixIntent } from '../intent.js';

describe('resolveGoalfixIntent', () => {
  it('preserves the raw founder request and returns high confidence when unchanged', () => {
    expect(resolveGoalfixIntent({ raw: 'Audit current main before judging the patch.' })).toEqual({
      raw: 'Audit current main before judging the patch.',
      resolved: 'Audit current main before judging the patch.',
      confidence: 'high',
      assumptions: [],
    });
  });

  it('labels an interpreted request as medium confidence and records assumptions', () => {
    const intent = resolveGoalfixIntent({
      raw: 'cont the skill thing',
      resolved: 'Continue the focused Goalfix skill-runtime implementation.',
      assumptions: ['The referenced skill is the uploaded Lean Build Suite.'],
    });

    expect(intent.confidence).toBe('medium');
    expect(intent.raw).toBe('cont the skill thing');
    expect(intent.assumptions).toEqual(['The referenced skill is the uploaded Lean Build Suite.']);
  });

  it('returns low confidence when the request cannot be resolved', () => {
    expect(resolveGoalfixIntent({ raw: '   ', resolved: '' }).confidence).toBe('low');
  });
});
