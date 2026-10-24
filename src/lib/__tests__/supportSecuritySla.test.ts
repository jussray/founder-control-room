import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const support = readFileSync(
  new URL('../../../docs/compliance/SUPPORT.md', import.meta.url),
  'utf8',
);
const security = readFileSync(
  new URL('../../../SECURITY.md', import.meta.url),
  'utf8',
);

describe('security response timing policy', () => {
  it('does not publish the retired fixed security response windows', () => {
    expect(support).not.toContain('within 24 hours');
    expect(support).not.toContain('patch within 4 hours');
  });

  it('keeps SUPPORT.md aligned to the root security policy', () => {
    expect(support).toContain('No acknowledgement or remediation timeline is published for security reports.');
    expect(support).toContain('remediation timing follows root `SECURITY.md`');
    expect(security).toContain('no response-time or remediation-time guarantee is currently published');
  });
});
