import { describe, expect, it } from 'vitest';
import {
  classifyTruthEvidence,
  truthContinuityState,
  truthEvidenceIdentity,
} from '../truthConsoleRules.js';

describe('classifyTruthEvidence', () => {
  it('keeps a claim unknown when no evidence exists', () => {
    expect(classifyTruthEvidence([])).toBe('unknown');
  });

  it('verifies one passing supporting observation', () => {
    expect(classifyTruthEvidence([{ id: 'e1', relation: 'supports', status: 'pass' }])).toBe('verified');
  });

  it('verifies multiple passing supporting observations', () => {
    expect(classifyTruthEvidence([
      { id: 'e1', relation: 'supports', status: 'pass' },
      { id: 'e2', relation: 'supports', status: 'pass' },
    ])).toBe('verified');
  });

  it('keeps warning-only support inferred instead of falsely green', () => {
    expect(classifyTruthEvidence([{ id: 'e1', relation: 'supports', status: 'warn' }])).toBe('inferred');
  });

  it('keeps context-only evidence inferred', () => {
    expect(classifyTruthEvidence([{ id: 'e1', relation: 'context', status: 'pass' }])).toBe('inferred');
  });

  it('keeps pending evidence unknown', () => {
    expect(classifyTruthEvidence([{ id: 'e1', relation: 'supports', status: 'pending' }])).toBe('unknown');
  });

  it('marks any failed evidence conflicted', () => {
    expect(classifyTruthEvidence([
      { id: 'e1', relation: 'supports', status: 'pass' },
      { id: 'e2', relation: 'context', status: 'fail' },
    ])).toBe('conflicted');
  });

  it('marks an explicit contradiction conflicted even when its provider status passes', () => {
    expect(classifyTruthEvidence([{ id: 'e1', relation: 'contradicts', status: 'pass' }])).toBe('conflicted');
  });
});

describe('truthContinuityState', () => {
  const now = Date.parse('2026-09-17T18:00:00.000Z');

  it('gives explicit invalidation precedence over expiry', () => {
    expect(truthContinuityState({
      invalidated_at: '2026-09-17T17:00:00.000Z',
      valid_until: '2026-09-17T16:00:00.000Z',
    }, now)).toBe('stale');
  });

  it('marks a time-bounded marker expired after valid_until', () => {
    expect(truthContinuityState({ valid_until: '2026-09-17T17:59:59.000Z' }, now)).toBe('expired');
  });

  it('keeps a future marker current', () => {
    expect(truthContinuityState({ valid_until: '2026-09-18T18:00:00.000Z' }, now)).toBe('current');
  });
});

describe('truthEvidenceIdentity', () => {
  it('canonicalizes evidence order before hashing or reconciliation', () => {
    expect(truthEvidenceIdentity([
      { id: 'z', relation: 'context', status: 'warn' },
      { id: 'a', relation: 'supports', status: 'pass' },
    ])).toEqual([
      { id: 'a', relation: 'supports', status: 'pass' },
      { id: 'z', relation: 'context', status: 'warn' },
    ]);
  });
});
