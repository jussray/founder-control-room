import { describe, expect, it } from 'vitest';
import { resolveGoalfixIntent } from '../intent.js';

describe('resolveGoalfixIntent', () => {
  it('returns high confidence when the founder explicitly confirms unchanged intent', () => {
    expect(resolveGoalfixIntent({
      raw: 'Audit current main before judging the patch.',
      confirmed: true,
    })).toEqual({
      raw: 'Audit current main before judging the patch.',
      resolved: 'Audit current main before judging the patch.',
      confidence: 'high',
      assumptions: [],
      confirmed: true,
    });
  });

  it('treats an explicit same-text resolution as a valid confirmation signal', () => {
    const intent = resolveGoalfixIntent({
      raw: 'Audit current main before judging the patch.',
      resolved: 'Audit current main before judging the patch.',
    });

    expect(intent.confidence).toBe('high');
    expect(intent.confirmed).toBe(true);
  });

  it('does not let alternative resolved wording silently confirm founder intent even when an automatic caller sets confirmed', () => {
    const intent = resolveGoalfixIntent({
      raw: 'cont the skill thing',
      resolved: 'Continue the focused Goalfix skill-runtime implementation.',
      confirmed: true,
    });

    expect(intent.confidence).toBe('low');
    expect(intent.confirmed).toBe(false);
  });

  it('requires explicit confirmation plus interpretation assumptions for a semantic rewrite', () => {
    const unconfirmed = resolveGoalfixIntent({
      raw: 'cont the skill thing',
      resolved: 'Continue the focused Goalfix skill-runtime implementation.',
      assumptions: ['The referenced skill is the uploaded Lean Build Suite.'],
    });
    expect(unconfirmed.confidence).toBe('low');
    expect(unconfirmed.confirmed).toBe(false);

    const confirmed = resolveGoalfixIntent({
      raw: 'cont the skill thing',
      resolved: 'Continue the focused Goalfix skill-runtime implementation.',
      assumptions: ['The referenced skill is the uploaded Lean Build Suite.'],
      confirmed: true,
    });
    expect(confirmed.confidence).toBe('medium');
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.assumptions).toEqual(['The referenced skill is the uploaded Lean Build Suite.']);
  });

  it('does not let assumptions raise an unconfirmed raw-only goal', () => {
    const intent = resolveGoalfixIntent({
      raw: 'cont the skill thing',
      assumptions: ['The referenced skill is the uploaded Lean Build Suite.'],
    });

    expect(intent.confidence).toBe('low');
    expect(intent.confirmed).toBe(false);
    expect(intent.assumptions).toEqual(['The referenced skill is the uploaded Lean Build Suite.']);
  });

  it('returns low confidence for a nonempty raw-only goal without confirmation', () => {
    const intent = resolveGoalfixIntent({ raw: 'cont the skill thing' });

    expect(intent.confidence).toBe('low');
    expect(intent.resolved).toBe('cont the skill thing');
    expect(intent.confirmed).toBe(false);
  });

  it('returns low confidence when the request cannot be resolved', () => {
    expect(resolveGoalfixIntent({ raw: '   ', resolved: '' }).confidence).toBe('low');
  });
});
