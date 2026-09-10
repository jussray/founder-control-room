import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cohesionAudit = readFileSync('docs/FCR_SINGLE_OS_COHESION_AUDIT.md', 'utf8');

describe('Founder challenge stack contract', () => {
  it('keeps portfolio rollout and authority boundaries load-bearing in the default test plane', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/verify-founder-intelligence-inheritance.mjs'],
      { encoding: 'utf8' },
    );

    expect(output).toContain('Founder Intelligence inheritance contract passed.');
    expect(output).toContain('Challenge stack — on-main: 7; pending-main: 1');
    expect(output).toContain('External continuity coverage: 4; authority promoted: 0');
  });

  it('keeps the FCR single-OS cohesion rule load-bearing', () => {
    for (const phrase of [
      'Founder Control Room is the single founder operating system and product shell.',
      'The founder should express intent once. FCR must coordinate the capabilities needed to advance that intent.',
      'future add-ons may exist as implementation layers or named capabilities, but they must not become competing operating systems for the founder.',
      'Every FCR-internal subsystem must plug into this loop rather than inventing a parallel one.',
      'New functionality should extend FCR rather than create another OS beside it.',
      'Any `COHESION` answer other than **extends FCR** is a blocker for expansion until reconciled.',
    ]) {
      expect(cohesionAudit).toContain(phrase);
    }

    const expectedFounderIntentLoop = [
      'Founder Intent',
      'Reality / Current State',
      'Capability Selection',
      'Authority',
      'Action',
      'Evidence',
      'Outcome',
      'Next Gate',
    ];

    let previousIndex = -1;
    for (const step of expectedFounderIntentLoop) {
      const index = cohesionAudit.indexOf(step);
      expect(index, `cohesion audit missing founder-intent loop step ${step}`).toBeGreaterThanOrEqual(0);
      expect(index, `founder-intent loop order drifted at ${step}`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });
});
