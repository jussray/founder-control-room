import { describe, expect, it } from 'vitest';
import {
  FirstSliceEngine,
  classifySensitiveCategories,
} from '../firstSliceEngine.js';

describe('FirstSliceEngine', () => {
  const engine = new FirstSliceEngine();

  it('is deterministic for the same input and privacy choice', () => {
    const input = {
      rawText: 'I need to finish the product build and choose the next launch step.',
      privacyChoice: 'process_without_saving' as const,
    };

    expect(engine.run(input)).toEqual(engine.run(input));
  });

  it('classifies sensitive categories on the server-owned path', () => {
    expect(classifySensitiveCategories('My child is involved in a custody issue.')).toEqual([
      'legal',
      'teen',
      'family_conflict',
    ]);
    expect(classifySensitiveCategories('Here is my API key and password.')).toEqual(['credentials']);
  });

  it('never emits a tiny move for sensitive input', () => {
    const result = engine.run({
      rawText: 'My child is involved in a custody issue and I need to think clearly about it.',
      privacyChoice: 'process_without_saving',
    });

    expect(result.sensitiveCategories.length).toBeGreaterThan(0);
    expect(result.move.kind).toBe('protective_move');
    expect(result.move.policy).toBe('protective');
  });

  it('routes direct high-consequence health language into the protective lane', () => {
    const result = engine.run({
      rawText: 'I am worried about self-harm.',
      privacyChoice: 'process_without_saving',
    });

    expect(result.sensitiveCategories).toContain('health');
    expect(result.move.kind).toBe('protective_move');
    expect(result.move.policy).toBe('protective');
  });

  it('keeps tiny moves inside the canonical 5-15 minute window', () => {
    const result = engine.run({
      rawText: 'I need to finish the product build today.',
      privacyChoice: 'process_without_saving',
    });

    expect(result.move.kind).toBe('tiny_move');
    expect(result.move.timeEstimateMinutes).toBeGreaterThanOrEqual(5);
    expect(result.move.timeEstimateMinutes).toBeLessThanOrEqual(15);
  });

  it('stores no redacted summary in process-without-saving mode', () => {
    const result = engine.run({
      rawText: 'Email founder@example.com about the build plan.',
      privacyChoice: 'process_without_saving',
    });

    expect(result.redactedSummary).toBeNull();
  });

  it('creates a bounded category-level saved summary without echoing raw identifiers', () => {
    const rawText = 'Email founder@example.com about the product build plan.';
    const result = engine.run({
      rawText,
      privacyChoice: 'save_redacted_summary',
    });

    expect(result.redactedSummary).not.toBeNull();
    expect(result.redactedSummary?.length).toBeLessThanOrEqual(300);
    expect(result.redactedSummary).not.toContain('founder@example.com');
    expect(result.redactedSummary).not.toContain(rawText);
  });

  it('returns between one and three deterministic intent tags', () => {
    const result = engine.run({
      rawText: 'I need to finish the build, talk to a client, and make a money decision.',
      privacyChoice: 'process_without_saving',
    });

    expect(result.intentTags.length).toBeGreaterThanOrEqual(1);
    expect(result.intentTags.length).toBeLessThanOrEqual(3);
    expect(result.intentTags).toEqual(['money', 'build', 'people']);
  });
});
