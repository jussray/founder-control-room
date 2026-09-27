import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_ATTACK_FLOWS,
  HALLWAY_BASE_EXPANSION,
  HALLWAY_RANDOM_EXPANSION_MAX,
  activeDefenseResponse,
  evaluateActiveDefenseRequest,
} from './activeDefense.js';

function requestWithCf(
  url: string,
  init: RequestInit = {},
  cf: Record<string, unknown> = {},
): Request {
  const request = new Request(url, init) as Request & { cf?: Record<string, unknown> };
  request.cf = cf;
  return request;
}

const SECRET = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789_-';

describe('active defense', () => {
  it('allows a verified bot while still running the full attack unit', () => {
    const request = requestWithCf(
      'https://api.foundercontrolroom.org/version',
      {
        headers: {
          'CF-Connecting-IP': '203.0.113.10',
          'CF-Ray': 'ray-verified',
          'User-Agent': 'ExampleBot/1.0',
        },
      },
      {
        asn: 64500,
        asOrganization: 'Example Network',
        verifiedBotCategory: 'SearchEngine',
        botManagement: { score: 99, verifiedBot: true, ja4: 'ja4-example' },
      },
    );

    const decision = evaluateActiveDefenseRequest(request, {
      ACTIVE_DEFENSE_MODE: 'contain',
      FOUNDER_SESSION_ENCRYPTION_KEY: SECRET,
    });

    expect(decision.verdict).toBe('VERIFIED_BOT');
    expect(decision.logicalExpansion).toBe(0);
    expect(decision.attackUnit.map((item) => item.flow)).toEqual(ACTIVE_ATTACK_FLOWS);
  });

  it('routes reconnaissance into 48K plus bounded random logical expansion', () => {
    const request = requestWithCf(
      'https://api.foundercontrolroom.org/.env',
      {
        headers: {
          'CF-Connecting-IP': '198.51.100.7',
          'CF-Ray': 'ray-probe',
          'User-Agent': 'unknown-crawler/7.2',
        },
      },
      {
        asn: 64501,
        asOrganization: 'Probe Network',
        botManagement: { score: 4, verifiedBot: false, ja3Hash: 'ja3-probe', ja4: 'ja4-probe' },
      },
    );

    const decision = evaluateActiveDefenseRequest(request, {
      ACTIVE_DEFENSE_MODE: 'contain',
      FOUNDER_SESSION_ENCRYPTION_KEY: SECRET,
    });

    expect(decision.verdict).toBe('HALLWAY');
    expect(decision.fixedExpansion).toBe(HALLWAY_BASE_EXPANSION);
    expect(decision.randomExpansion).toBeGreaterThanOrEqual(1);
    expect(decision.randomExpansion).toBeLessThanOrEqual(HALLWAY_RANDOM_EXPANSION_MAX);
    expect(decision.logicalExpansion).toBe(HALLWAY_BASE_EXPANSION + decision.randomExpansion);
    expect(decision.controls.outboundProbe).toBe(false);
    expect(decision.controls.productionExposure).toBe(0);
    expect(decision.attackUnit).toHaveLength(ACTIVE_ATTACK_FLOWS.length);
  });

  it('derives the same expansion from the same evidence and secret for reconstructable proof', () => {
    const make = () => requestWithCf(
      'https://api.foundercontrolroom.org/.git/config',
      {
        headers: {
          'CF-Connecting-IP': '198.51.100.8',
          'CF-Ray': 'ray-deterministic',
          'User-Agent': 'scanner/1.0',
        },
      },
      { asn: 64502, botManagement: { score: 2, verifiedBot: false } },
    );

    const first = evaluateActiveDefenseRequest(make(), {
      ACTIVE_DEFENSE_MODE: 'contain',
      FOUNDER_SESSION_ENCRYPTION_KEY: SECRET,
    });
    const second = evaluateActiveDefenseRequest(make(), {
      ACTIVE_DEFENSE_MODE: 'contain',
      FOUNDER_SESSION_ENCRYPTION_KEY: SECRET,
    });

    expect(second.incidentFingerprint).toBe(first.incidentFingerprint);
    expect(second.randomExpansion).toBe(first.randomExpansion);
  });

  it('materializes only a small synthetic continuation set and never includes the secret', async () => {
    const request = requestWithCf(
      'https://api.foundercontrolroom.org/wp-admin/',
      {
        headers: {
          'CF-Connecting-IP': '198.51.100.9',
          'CF-Ray': 'ray-hallway',
          'User-Agent': 'scanner/2.0',
        },
      },
      { botManagement: { score: 1, verifiedBot: false } },
    );
    const decision = evaluateActiveDefenseRequest(request, {
      ACTIVE_DEFENSE_MODE: 'contain',
      FOUNDER_SESSION_ENCRYPTION_KEY: SECRET,
    });

    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = activeDefenseResponse(request, decision);
    expect(response).not.toBeNull();
    const body = await response!.text();
    expect(body).not.toContain(SECRET);
    const parsed = JSON.parse(body) as { continuation: string[] };
    expect(parsed.continuation).toHaveLength(8);
    expect(parsed.continuation.every((value) => value.startsWith('https://api.foundercontrolroom.org/'))).toBe(true);
  });

  it('observes claimed automation on ordinary routes without diverting it', () => {
    const request = requestWithCf(
      'https://api.foundercontrolroom.org/api/public',
      {
        headers: {
          'CF-Connecting-IP': '203.0.113.22',
          'CF-Ray': 'ray-observe',
          'User-Agent': 'curl/9.0',
        },
      },
      { asn: 64503 },
    );

    const decision = evaluateActiveDefenseRequest(request, {
      ACTIVE_DEFENSE_MODE: 'contain',
      FOUNDER_SESSION_ENCRYPTION_KEY: SECRET,
    });

    expect(decision.verdict).toBe('OBSERVE_AUTOMATION');
    expect(decision.logicalExpansion).toBe(0);
  });
});
