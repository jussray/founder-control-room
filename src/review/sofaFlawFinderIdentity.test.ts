import { describe, expect, it, vi } from 'vitest';
import {
  SOFA_BASE_URL,
  SOFA_FLAW_FINDER_AGENT_NAME,
  SOFA_FLAW_FINDER_IDENTITY_CONTRACT,
  SOFA_FLAW_FINDER_PUBLICATION_POLICY,
  SOFA_FLAW_FINDER_ROLE,
  extractSofaOwnedAgents,
  fetchSofaFlawFinderIdentity,
  validateSofaFlawFinderIdentityReceipt,
} from './sofaFlawFinderIdentity.js';

const NOW = Date.parse('2026-09-24T06:20:00.000Z');
const EXPIRES = '2026-09-24T06:50:00.000Z';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fetchFixture(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === `${SOFA_BASE_URL}/api/sessions`) {
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer secret-key');
      expect(headers.get('X-Sofa-Client-Name')).toBe('founder-control-room');
      expect(headers.get('X-Sofa-Model-Name')).toBe('unknown');
      expect(headers.get('X-Sofa-Model-Provider')).toBe('unknown');
      return jsonResponse({ session_id: 'session-secret', expires_at: EXPIRES }, 201);
    }
    if (url === `${SOFA_BASE_URL}/api/me/agents`) {
      expect(init?.method).toBe('GET');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer secret-key');
      expect(headers.get('X-Sofa-Session')).toBe('session-secret');
      return jsonResponse({
        agents: [
          {
            agent_id: 'agent-123',
            name: SOFA_FLAW_FINDER_AGENT_NAME,
            description: 'Evidence-first adversarial reviewer.',
            role: SOFA_FLAW_FINDER_ROLE,
            publication_policy: SOFA_FLAW_FINDER_PUBLICATION_POLICY,
            privileges: ['create_posts', 'create_drafts'],
            ...overrides,
          },
        ],
      });
    }
    return jsonResponse({ error: 'unexpected url' }, 404);
  });
}

describe('SOFA Flaw Finder identity preflight', () => {
  it('normalizes direct arrays and supported owned-agent envelopes', () => {
    const raw = {
      agent_id: 'agent-1',
      name: 'Flaw Finder',
      description: 'reviewer',
      role: 'contributor',
      publication_policy: 'draft_directly',
      privileges: ['b', 'a', 'a'],
    };
    expect(extractSofaOwnedAgents([raw])).toEqual(extractSofaOwnedAgents({ agents: [raw] }));
    expect(extractSofaOwnedAgents([raw])).toEqual(extractSofaOwnedAgents({ items: [raw] }));
    expect(extractSofaOwnedAgents([raw])[0]?.privileges).toEqual(['a', 'b']);
  });

  it('creates a fresh, non-authorizing receipt from the authenticated owned-agent read', async () => {
    const fetchImpl = fetchFixture();
    const receipt = await fetchSofaFlawFinderIdentity('secret-key', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });

    expect(receipt.contract).toBe(SOFA_FLAW_FINDER_IDENTITY_CONTRACT);
    expect(receipt.agentId).toBe('agent-123');
    expect(receipt.agentName).toBe('Flaw Finder');
    expect(receipt.role).toBe('contributor');
    expect(receipt.publicationPolicy).toBe('draft_directly');
    expect(receipt.proposalOnly).toBe(true);
    expect(Object.values(receipt.authority)).toEqual([false, false, false, false, false, false]);
    expect(JSON.stringify(receipt)).not.toContain('secret-key');
    expect(JSON.stringify(receipt)).not.toContain('session-secret');
    expect(validateSofaFlawFinderIdentityReceipt(receipt, NOW)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the owned Flaw Finder policy drifts to direct publication', async () => {
    await expect(fetchSofaFlawFinderIdentity('secret-key', {
      fetchImpl: fetchFixture({ publication_policy: 'publish_directly' }) as unknown as typeof fetch,
      now: () => NOW,
    })).rejects.toThrow(/publication policy drifted/);
  });

  it('fails closed when the expected agent identity is missing or ambiguous', async () => {
    const missing = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/sessions')) return jsonResponse({ session_id: 's', expires_at: EXPIRES }, 201);
      return jsonResponse({ agents: [] });
    });
    await expect(fetchSofaFlawFinderIdentity('secret-key', {
      fetchImpl: missing as unknown as typeof fetch,
      now: () => NOW,
    })).rejects.toThrow(/exactly one owned Flaw Finder agent; found 0/);

    const duplicate = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/sessions')) return jsonResponse({ session_id: 's', expires_at: EXPIRES }, 201);
      const agent = {
        agent_id: 'one',
        name: 'Flaw Finder',
        role: 'contributor',
        publication_policy: 'draft_directly',
      };
      return jsonResponse({ agents: [agent, { ...agent, agent_id: 'two' }] });
    });
    await expect(fetchSofaFlawFinderIdentity('secret-key', {
      fetchImpl: duplicate as unknown as typeof fetch,
      now: () => NOW,
    })).rejects.toThrow(/exactly one owned Flaw Finder agent; found 2/);
  });

  it('rejects stale sessions and authority widening', async () => {
    const receipt = await fetchSofaFlawFinderIdentity('secret-key', {
      fetchImpl: fetchFixture() as unknown as typeof fetch,
      now: () => NOW,
    });
    expect(validateSofaFlawFinderIdentityReceipt(receipt, Date.parse(EXPIRES)))
      .toContain('SOFA identity session is stale');

    const widened = {
      ...receipt,
      authority: { ...receipt.authority, publish: true },
    } as typeof receipt;
    expect(validateSofaFlawFinderIdentityReceipt(widened, NOW))
      .toContain('SOFA identity receipt cannot carry mutation or promotion authority');
  });
});
