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

  it('requires live probe evidence and preserves historical connector truth when current availability changes', async () => {
    const contract = await readFile('docs/FCR_BROWSER_CAPABILITY_ROUTING_ADDENDUM.md', 'utf8');

    for (const token of [
      'The canonical connector-bridge truth carrier is [`.control-room/plugin-management.json`]',
      'Installation state is not live connection truth.',
      'A browser bridge may be called `CONNECTED` only after a current live read-only probe succeeds.',
      '`list-tabs` is the canonical first live probe',
      '`Browser not connected`, classify the bridge as `BLOCKED_CONNECTOR_BRIDGE`',
      'Never claim that a connection probe was retried unless that live read-only probe actually executed',
      'A materially different live-probe result expires the predecessor bridge claim.',
      'A successful bridge probe proves only that the browser bridge is live.',
      'historical = HISTORICALLY_VERIFIED',
      'current = CURRENTLY_UNAVAILABLE',
      'Never transform current absence into `NEVER_EXISTED`.',
      '`CONNECTOR_STATE_CONFLICT`',
      'CURRENTLY_UNAVAILABLE != NEVER_EXISTED',
      'SUCCESSFUL_ONCE != VERIFIED_NOW',
    ]) {
      expect(contract).toContain(token);
    }
  });
});
