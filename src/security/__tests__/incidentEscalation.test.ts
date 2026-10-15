import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escalateToSlack,
  escalateToPagerDuty,
  logIncidentToLinear,
  escalateIncident,
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
    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/TEST/TEST/PLACEHOLDER' };

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
    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/TEST/TEST/PLACEHOLDER' };

    const result = await escalateToSlack(verdict, env);
    expect(result).toBe(false);
  });

  it('handles missing webhooks gracefully', async () => {
    const verdict = createMockVerdict('REPAIR_REQUIRED');
    const env = {}; // No webhook URL

    const result = await escalateToSlack(verdict, env);
    expect(result).toBe(false);
  });

  it('uses an explicit channel when SLACK is a bot token', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, ts: '123.456' }), { status: 200 }),
    ) as any;

    const ok = await escalateToSlack(createMockVerdict(), {
      SLACK: 'xoxb-test-only',
      FCR_SLACK_CHANNEL_ID: 'C0BQ2Q2S9B4',
    });
    expect(ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(options.headers.Authorization).toBe('Bearer xoxb-test-only');
    expect(JSON.parse(options.body).channel).toBe('C0BQ2Q2S9B4');
  });

  it('accepts SLACK as a webhook URL without leaking it into headers', async () => {
    global.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any;
    const webhook = 'https://hooks.slack.com/services/TEST/TEST/PLACEHOLDER';

    const ok = await escalateToSlack(createMockVerdict(), { SLACK: webhook });
    expect(ok).toBe(true);
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toBe(webhook);
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('blocks arbitrary legacy webhook hosts before sending incident data', async () => {
    global.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any;
    const rejected = await escalateToSlack(createMockVerdict(), {
      SLACK_WEBHOOK_URL: 'https://collector.example.net/incident',
    });
    expect(rejected).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects lookalike Slack hostnames and prevents HTTP redirects', async () => {
    global.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any;
    const rejected = await escalateToSlack(createMockVerdict(), {
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com.evil.example/services/T/B/FAKE',
    });
    expect(rejected).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();

    const accepted = await escalateToSlack(createMockVerdict(), {
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T/B/PLACEHOLDER',
    });
    expect(accepted).toBe(true);
    const [, options] = (global.fetch as any).mock.calls[0];
    expect(options.redirect).toBe('error');
  });

  it('does not use SLACK bot credentials without an explicit FCR channel', async () => {
    global.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any;

    const ok = await escalateToSlack(createMockVerdict(), { SLACK: 'xoxb-test-only' });
    expect(ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects unknown SLACK credential shapes without sending', async () => {
    global.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any;

    const ok = await escalateToSlack(createMockVerdict(), {
      SLACK: 'xapp-not-a-bot-token',
      FCR_SLACK_CHANNEL_ID: 'C0BQ2Q2S9B4',
    });
    expect(ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not treat an HTTP 200 Slack API error as delivered', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: 'missing_scope' }), { status: 200 }),
    ) as any;

    const ok = await escalateToSlack(createMockVerdict(), {
      SLACK: 'xoxb-test-only',
      FCR_SLACK_CHANNEL_ID: 'C0BQ2Q2S9B4',
    });
    expect(ok).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('[incident-escalation] Slack API rejected delivery');
    errorSpy.mockRestore();
  });

  it('does not log secret-bearing Slack transport error bodies', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async () =>
      new Response('xoxb-SECRET-DO-NOT-LOG', { status: 403 }),
    ) as any;

    const ok = await escalateToSlack(createMockVerdict(), {
      SLACK: 'xoxb-test-only',
      FCR_SLACK_CHANNEL_ID: 'C0BQ2Q2S9B4',
    });
    expect(ok).toBe(false);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('SECRET-DO-NOT-LOG');
    errorSpy.mockRestore();
  });

  it('emits telemetry with escalation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    global.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any;

    const verdict = createMockVerdict('REPAIR_REQUIRED');
    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/TEST/TEST/PLACEHOLDER' };

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

  it('does not log PagerDuty provider error bodies', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async () =>
      new Response('secret-looking-pagerduty-detail', { status: 403 }),
    ) as any;

    const result = await escalateToPagerDuty(createMockVerdict('CONTAIN_ESCALATE'), {
      PAGERDUTY_INTEGRATION_KEY: 'test-only-key',
    });

    expect(result).toBe(false);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret-looking-pagerduty-detail');
    errorSpy.mockRestore();
  });

  it('rejects Linear GraphQL errors without logging provider-controlled text', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('linear')) {
        return new Response(
          JSON.stringify({ errors: [{ message: 'secret-looking-provider-detail' }], data: null }),
          { status: 200 },
        );
      }
      return new Response('error', { status: 404 });
    }) as any;

    const result = await logIncidentToLinear(createMockVerdict('REPAIR_REQUIRED'), {
      LINEAR_API_KEY: 'test-only-key',
    });

    expect(result).toBe(false);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret-looking-provider-detail');
    errorSpy.mockRestore();
  });

  it('reports a critical failure only when all escalation channels fail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async () => new Response('error', { status: 500 })) as any;

    await escalateIncident(createMockVerdict('REPAIR_REQUIRED'), {});

    expect(errorSpy.mock.calls.some((call) =>
      typeof call[0] === 'string' && call[0].includes('CRITICAL: Escalation failed'),
    )).toBe(true);
    errorSpy.mockRestore();
  });

  it('ignores non-meaningful verdicts', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const verdict = createMockVerdict('OBSERVE');
    verdict.meaningful = false;

    const env = { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/TEST/TEST/PLACEHOLDER' };
    emitReciprocalTelemetryWithEscalation(verdict, env);

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
