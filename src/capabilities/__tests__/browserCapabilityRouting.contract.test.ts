import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('FCR browser capability routing contract', () => {
  it('keeps browser providers subordinate to FCR and actively prefers connected Opera for browser-only work', async () => {
    const contract = await readFile('docs/FCR_BROWSER_CAPABILITY_ROUTING_ADDENDUM.md', 'utf8');

    for (const token of [
      'Direct provider API / connected plugin / scoped MCP capability first',
      'Opera Browser Connector / authenticated Opera bridge second',
      'Another authenticated browser bridge third',
      'Generic browser automation last',
      'When Opera Browser Connector is connected and the founder intent requires authenticated browser interaction',
      'FCR should actually route the browser-only portion through Opera',
      'Browser access is capability, not authority',
      'Continuity fingerprints and proof cookies are non-secret correlation markers only',
      'Provider acceptance and verified founder outcome remain separate truth states',
      'retrying an ambiguous mutation without reconciling whether it already executed',
    ]) {
      expect(contract).toContain(token);
    }

    expect(contract).toContain('**Parent contract:** `docs/FCR_SINGLE_OS_COHESION_AUDIT.md`');
    expect(contract).toContain('Opera is a preferred browser capability, not an architectural dependency.');
    expect(contract).toContain('A browser provider may not manufacture, inherit, widen, replay, or renew founder approval.');
  });
});
