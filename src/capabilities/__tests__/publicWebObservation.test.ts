import { describe, expect, it, vi } from 'vitest';
import {
  observePublicWeb,
  PUBLIC_WEB_OBSERVATION_CAPABILITY,
} from '../publicWebObservation.js';

function fakeHub(result: unknown) {
  return {
    discoverCapabilities: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'web_search_exa',
          description: 'search',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
          },
        },
        {
          name: 'web_fetch_exa',
          description: 'fetch',
          inputSchema: {
            type: 'object',
            properties: { url: { type: 'string' } },
          },
        },
      ],
    }),
    invoke: vi.fn().mockResolvedValue({
      result,
      policy: { decision: 'allow', risk: 'read' },
    }),
  } as any;
}

describe('FCR-owned public web observation', () => {
  it('keeps the product contract provider-neutral', () => {
    expect(PUBLIC_WEB_OBSERVATION_CAPABILITY.id).toBe('public-web-observation-v1');
    expect(PUBLIC_WEB_OBSERVATION_CAPABILITY.runtime).toBe('dynamic');
    expect(PUBLIC_WEB_OBSERVATION_CAPABILITY.environment).toContain(
      'The capability contract is provider-neutral',
    );
    expect(PUBLIC_WEB_OBSERVATION_CAPABILITY.environment).toContain(
      'No provider-specific secret belongs to this capability',
    );
  });

  it('routes search through the governed read-only hub', async () => {
    const hub = fakeHub({
      results: [{
        title: 'Evidence',
        url: 'https://example.com/evidence',
        text: 'Observed public evidence',
      }],
    });

    const receipt = await observePublicWeb(
      { operation: 'search', query: 'founder control room evidence' },
      hub,
    );

    expect(hub.discoverCapabilities).toHaveBeenCalledWith('exa', 'founder-control-room');
    expect(hub.invoke).toHaveBeenCalledWith(expect.objectContaining({
      serverId: 'exa',
      projectId: 'founder-control-room',
      toolName: 'web_search_exa',
    }));
    expect(receipt).toMatchObject({
      contract: 'fcr/public-web-observation@v1',
      provider: 'fcr-research-hub',
      operation: 'search',
      authority: 'read_only',
      consequence: 'READ',
      mutationAllowed: false,
      truthState: 'provider_observed_unverified',
      contentTrust: 'untrusted_web',
      sourceUrls: ['https://example.com/evidence'],
      continuity: { transition: 'initial', authorityEffect: 'none' },
    });
    expect(receipt.requestFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt.continuity.evidenceFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt.continuity.proofCookie).toMatch(/^fcr-public-web:v1:[0-9a-f]{32}$/);
  });

  it('preserves continuity without granting authority', async () => {
    const result = { results: [{ url: 'https://example.com/a', text: 'one' }] };
    const first = await observePublicWeb(
      { operation: 'search', query: 'same query' },
      fakeHub(result),
    );
    const second = await observePublicWeb({
      operation: 'search',
      query: 'same query',
      continuity: {
        priorEvidenceFingerprint: first.continuity.evidenceFingerprint,
        priorProofCookie: first.continuity.proofCookie,
      },
    }, fakeHub(result));

    expect(second.continuity.transition).toBe('confirmed');
    expect(second.continuity.authorityEffect).toBe('none');
    expect(second.authority).toBe('read_only');
    expect(second.mutationAllowed).toBe(false);
  });

  it('rejects local fetch targets before invoking the research adapter', async () => {
    const hub = fakeHub({});

    await expect(observePublicWeb(
      { operation: 'fetch', urls: ['http://127.0.0.1/private'] },
      hub,
    )).rejects.toMatchObject({ code: 'public_web_invalid_request' });
    expect(hub.invoke).not.toHaveBeenCalled();
  });

  it('fails closed if the research hub does not return read-only policy', async () => {
    const hub = fakeHub({ results: [] });
    hub.invoke.mockResolvedValue({
      result: { results: [] },
      policy: { decision: 'allow', risk: 'write' },
    });

    await expect(observePublicWeb(
      { operation: 'search', query: 'bounded query' },
      hub,
    )).rejects.toMatchObject({ code: 'public_web_upstream_failure' });
  });
});
