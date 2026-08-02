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

  it('does not treat incomplete checks as repeated failure evidence', () => {
    const result = detectGoalfixStagnation([
      {
        approach: 'Inspect queued Playwright evidence.',
        failureSignature: 'verification:playwright',
        filesTouched: [],
        verificationName: 'Playwright',
        result: 'incomplete',
      },
      {
        approach: 'Inspect running Playwright evidence.',
        failureSignature: 'verification:playwright',
        filesTouched: [],
        verificationName: 'Playwright',
        result: 'incomplete',
      },
    ]);

    expect(result.stagnant).toBe(false);
    expect(result.matchingAttempts).toBe(0);
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

  it('clears two stale failures after the same signature passes', () => {
    const result = detectGoalfixStagnation([
      failedAttempt('runner unavailable'),
      failedAttempt('Runner unavailable'),
      {
        approach: 'Restore the runner and rerun the exact check.',
        failureSignature: 'runner unavailable',
        filesTouched: ['.github/workflows/ci.yml'],
        verificationName: 'Playwright',
        result: 'passed',
      },
    ]);

    expect(result.stagnant).toBe(false);
    expect(result.repeatedFailureSignature).toBeUndefined();
    expect(result.matchingAttempts).toBe(0);
  });

  it('starts a fresh count after a resolved signature fails again', () => {
    const result = detectGoalfixStagnation([
      failedAttempt('runner unavailable'),
      failedAttempt('runner unavailable'),
      {
        approach: 'Restore the runner.',
        failureSignature: 'runner unavailable',
        filesTouched: ['.github/workflows/ci.yml'],
        verificationName: 'Playwright',
        result: 'passed',
      },
      failedAttempt('runner unavailable'),
    ]);

    expect(result.stagnant).toBe(false);
  });
});
