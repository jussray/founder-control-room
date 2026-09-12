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

  it('requires live connection proof before claiming a browser bridge is connected', async () => {
    const contract = await readFile('docs/FCR_BROWSER_CAPABILITY_ROUTING_ADDENDUM.md', 'utf8');
    const chatgptContract = await readFile('CHATGPT.md', 'utf8');

    for (const token of [
      'Installation state is not connection truth.',
      '`CONNECTED` may be claimed only after a live read-only browser probe succeeds in the current session.',
      '`list-tabs` is the canonical first probe',
      '`Browser not connected` classifies the state as `BLOCKED_RUNTIME_HANDSHAKE`',
      'saying that a connection was retried requires evidence that the live probe was actually executed',
      'A materially different live-probe result expires the predecessor connection claim.',
      'A successful connection probe proves only that the bridge is live.',
    ]) {
      expect(contract).toContain(token);
    }

    for (const token of [
      '## Browser connector truth memory',
      'Installed/enabled plugin state does not prove a live browser session.',
      'Before saying a browser connector is connected, execute the smallest current read-only live probe',
      '`BLOCKED_RUNTIME_HANDSHAKE`',
      'Never say a live connector probe was retried unless the probe was actually executed',
      'Update continuity fingerprints/proof cookies bidirectionally when live connection evidence changes.',
      'This connection-truth rule is durable across future FCR browser tasks',
    ]) {
      expect(chatgptContract).toContain(token);
    }
  });
});
