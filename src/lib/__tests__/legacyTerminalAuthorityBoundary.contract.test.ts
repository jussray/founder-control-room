import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bootstrap = readFileSync('public/control-room/opaque-session-bootstrap.js', 'utf8');

describe('legacy terminal authority compatibility boundary', () => {
  it('removes confirmWrite as a browser authority signal and teaches the real L99 gate', () => {
    expect(bootstrap).toContain('installLegacyTerminalAuthorityBoundary');
    expect(bootstrap).toContain('delete payload.confirmWrite');
    expect(bootstrap).toContain('input[name="confirmWrite"]');
    expect(bootstrap).toContain('Write and verify commands require a fresh L99 approval receipt.');
    expect(bootstrap).toContain('This form never grants execution authority.');
  });

  it('narrows the compatibility rewrite to terminal run requests only', () => {
    expect(bootstrap).toContain('/^\\/terminal\\/[^/]+\\/run$/');
    expect(bootstrap).toContain('return nativeFetch(input, init)');
  });
});
