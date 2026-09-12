import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('FCR browser capability routing contract', () => {
  it('keeps browser providers subordinate to FCR and prefers direct capabilities first', async () => {
    const contract = await readFile('docs/FCR_BROWSER_CAPABILITY_ROUTING_ADDENDUM.md', 'utf8');

    for (const token of [
      'Direct provider API / connected plugin / scoped MCP capability first',
      'Authenticated browser bridge second',
      'Generic browser automation last',
      'Browser access is capability, not authority',
      'Opera Neon may be used as an authenticated browser execution surface',
      'Continuity fingerprints and proof cookies are non-secret correlation markers only',
      'Provider acceptance and verified founder outcome remain separate truth states',
      'retrying an ambiguous mutation without reconciling whether it already executed',
    ]) {
      expect(contract).toContain(token);
    }

    expect(contract).toContain('Parent contract: `docs/FCR_SINGLE_OS_COHESION_AUDIT.md`');
    expect(contract).toContain('The product architecture must remain provider-agnostic.');
    expect(contract).toContain('A browser provider may not manufacture, inherit, widen, replay, or renew founder approval.');
  });
});
