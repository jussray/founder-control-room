import { describe, expect, it } from 'vitest';
import { detectGoalfixStagnation, type GoalfixAttempt } from '../stagnation.js';

const failedAttempt = (failureSignature: string): GoalfixAttempt => ({
  approach: 'Rerun the same verifier without changing the cause.',
  failureSignature,
  filesTouched: [],
  verificationName: 'Playwright',
  result: 'failed',
});

describe('detectGoalfixStagnation', () => {
  it('does not stop after one failed approach', () => {
    const result = detectGoalfixStagnation([failedAttempt('browser runner unavailable')]);

    expect(result.stagnant).toBe(false);
    expect(result.matchingAttempts).toBe(0);
  });

  it('stops when the same normalized failure repeats twice', () => {
    const result = detectGoalfixStagnation([
      failedAttempt('Browser runner unavailable'),
      failedAttempt('  browser   runner unavailable  '),
    ]);

    expect(result).toMatchObject({
      stagnant: true,
      repeatedFailureSignature: 'browser runner unavailable',
      matchingAttempts: 2,
    });
    expect(result.nextAction).toContain('Stop retrying the same path');
  });

  it('does not treat a passing attempt as repeated failure evidence', () => {
    const result = detectGoalfixStagnation([
      failedAttempt('typecheck failed'),
      {
        approach: 'Repair the type error.',
        failureSignature: 'typecheck failed',
        filesTouched: ['src/goalfix/engine.ts'],
        verificationName: 'Typecheck',
        result: 'passed',
      },
    ]);

    expect(result.stagnant).toBe(false);
  });
});
