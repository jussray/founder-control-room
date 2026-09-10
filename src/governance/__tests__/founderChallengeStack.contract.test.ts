import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

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
});
