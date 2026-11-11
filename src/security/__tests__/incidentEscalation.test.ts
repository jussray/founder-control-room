import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escalateToSlack,
  escalateToPagerDuty,
  type SecurityVerdict,
  emitReciprocalTelemetryWithEscalation,
} from '../incidentEscalation.js';

function createMockVerdict(verdict: string = 'REPAIR_REQUIRED'): SecurityVerdict {
  return {
    schema: 'juss/reciprocal-ingress@v1',
    service: 'chief-api',
    verdict: verdict as any,
    meaningful: true,
    unit: {
      unitVerdict: verdict,
      findings: [
        {
          category: 'scope-escalation',
          severity: 'critical',
          title: 'Unauthorized scope elevation attempt',
        },
      ],
    },
    technicalIdentity: {
      actorFingerprint: 'abc123def456',
      asn: 12345,
      country: 'CN',
      claimedCrawler: null,
      verifiedBot: false,
      botScore: null,
    },
    receipt: '0123456789abcdef',
    hallway: {
      active: false,
      baseExpansion: 0,
    },
    boundaries: {
      ownedOrAuthorizedSurfacesOnly: false,
      externalCompromise: true,
      externalExploit: false,
    },
  };
}

describe('incident-escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends REPAIR_REQUIRED to Slack', async () => {
    let capturedPayload: unknown;
    global.fetch = vi.fn(async (url, options) => {
      if (typeof url === 'string' && url.includes('slack')) {
        capturedPayload = JSON.parse(options?.body as string);
        return new Response('ok', { status: 200 });
      }
      return new Response('error', { status: 404 });
    }) as any;

    const verdict = createMockVerdict('REPAIR_REQUIRED');
    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' };

    const result = await escalateToSlack(verdict, env);
    expect(result).toBe(true);
    expect(capturedPayload).toBeDefined();
    const payload = capturedPayload as any;
    expect(payload.blocks).toBeDefined();
    expect(payload.text).toMatch(/REPAIR_REQUIRED/);
  });

  it('escalates CONTAIN_ESCALATE to PagerDuty', async () => {
    let pdCalled = false;
    global.fetch = vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('pagerduty')) {
        pdCalled = true;
        return new Response('ok', { status: 202 });
      }
      return new Response('error', { status: 404 });
    }) as any;

    const verdict = createMockVerdict('CONTAIN_ESCALATE');
    const env = { PAGERDUTY_INTEGRATION_KEY: 'test-key' };

    const result = await escalateToPagerDuty(verdict, env);
    expect(result).toBe(true);
    expect(pdCalled).toBe(true);
  });

  it('ignores non-escalatable verdicts', async () => {
    const verdict = createMockVerdict('OBSERVE');
    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' };

    const result = await escalateToSlack(verdict, env);
    expect(result).toBe(false);
  });

  it('handles missing webhooks gracefully', async () => {
    const verdict = createMockVerdict('REPAIR_REQUIRED');
    const env = {}; // No webhook URL

    const result = await escalateToSlack(verdict, env);
    expect(result).toBe(false);
  });

  it('emits telemetry with escalation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    global.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any;

    const verdict = createMockVerdict('REPAIR_REQUIRED');
    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' };

    let waitUntilCalled = false;
    emitReciprocalTelemetryWithEscalation(verdict, env, {
      waitUntil: (p) => {
        waitUntilCalled = true;
        p.catch(() => undefined);
      },
    });

    // Let async task settle
    await new Promise((r) => setTimeout(r, 50));

    expect(waitUntilCalled).toBe(true);
    logSpy.mockRestore();
  });

  it('ignores non-meaningful verdicts', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const verdict = createMockVerdict('OBSERVE');
    verdict.meaningful = false;

    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' };
    emitReciprocalTelemetryWithEscalation(verdict, env);

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  // IMPLANT 4 TEST: GraphQL error detection in Linear
  it('detects Linear GraphQL permission error (200 OK but errors in body)', async () => {
    let linearCalled = false;
    global.fetch = vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('linear')) {
        linearCalled = true;
        // Simulate Linear returning 200 OK with permission error in body
        return new Response(
          JSON.stringify({
            errors: [{ message: 'Insufficient scope: issues:create' }],
            data: null,
          }),
          { status: 200 },
        );
      }
      return new Response('error', { status: 404 });
    }) as any;

    const { logIncidentToLinear } = await import('../incidentEscalation.js');
    const verdict = createMockVerdict('REPAIR_REQUIRED');
    const env = { LINEAR_API_KEY: 'read-only-key' };

    const result = await logIncidentToLinear(verdict, env);
    expect(linearCalled).toBe(true);
    expect(result).toBe(false); // Should detect the error and return false
  });

  it('rejects malformed Linear JSON without claiming incident delivery', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('null', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const { logIncidentToLinear } = await import('../incidentEscalation.js');
    const result = await logIncidentToLinear(createMockVerdict('REPAIR_REQUIRED'), {
      LINEAR_API_KEY: 'not-a-real-key',
    });
    expect(result).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  // IMPLANT 5 TEST: Critical escalation failure detection
  it('detects when all escalation channels fail on REPAIR_REQUIRED', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // All channels fail
    global.fetch = vi.fn(async () => new Response('error', { status: 500 })) as any;

    const { escalateIncident } = await import('../incidentEscalation.js');
    const verdict = createMockVerdict('REPAIR_REQUIRED');
    const env = {}; // No webhooks

    await escalateIncident(verdict, env);

    // Check if critical error was logged
    const criticalErrorCall = errorSpy.mock.calls.find((call) =>
      typeof call[0] === 'string' && call[0].includes('CRITICAL: Escalation failed'),
    );

    expect(criticalErrorCall).toBeDefined();
    errorSpy.mockRestore();
  });
});
