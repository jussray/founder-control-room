import { describe, expect, it } from 'vitest';
import { founderContentOrchestrationReadiness } from './n8nConveyorReadiness.js';

describe('founder-content orchestration readiness', () => {
  it('reports an unconfigured Buffer-default lane without exposing provider secrets', () => {
    const readiness = founderContentOrchestrationReadiness({});

    expect(readiness).toEqual({
      state: 'not-configured',
      configured: false,
      enabled: false,
      webhookConfigured: false,
      bearerTokenConfigured: false,
      enabledProviders: ['buffer'],
      invalidProviders: [],
      bufferEnabled: true,
      bufferReadyForProbe: false,
      liveProbeRequired: true,
      liveVerified: false,
      secretValuesExposed: false,
    });
  });

  it('separates configured-but-disabled readiness from live proof', () => {
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'provider-secret-token',
    });

    expect(readiness.state).toBe('ready-for-probe');
    expect(readiness.configured).toBe(true);
    expect(readiness.enabled).toBe(false);
    expect(readiness.webhookConfigured).toBe(true);
    expect(readiness.bearerTokenConfigured).toBe(true);
    expect(readiness.bufferReadyForProbe).toBe(false);
    expect(readiness.liveVerified).toBe(false);
  });

  it('fails visibly when orchestration is enabled without complete transport configuration', () => {
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
    });

    expect(readiness.state).toBe('enabled-misconfigured');
    expect(readiness.enabled).toBe(true);
    expect(readiness.configured).toBe(false);
    expect(readiness.webhookConfigured).toBe(true);
    expect(readiness.bearerTokenConfigured).toBe(false);
    expect(readiness.bufferReadyForProbe).toBe(false);
  });

  it('fails visibly on unsupported provider allowlist entries', () => {
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'provider-secret-token',
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer,not-a-provider',
    });

    expect(readiness.state).toBe('invalid-provider-configuration');
    expect(readiness.invalidProviders).toEqual(['not-a-provider']);
    expect(readiness.bufferEnabled).toBe(true);
    expect(readiness.bufferReadyForProbe).toBe(false);
  });

  it('marks Buffer ready only for a controlled probe and never promotes configuration into live verification', () => {
    const webhookUrl = 'https://n8n.example/webhook/private-founder-content-path';
    const bearerToken = 'provider-secret-token';
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: webhookUrl,
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: bearerToken,
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
    });

    expect(readiness.state).toBe('enabled-awaiting-proof');
    expect(readiness.configured).toBe(true);
    expect(readiness.enabled).toBe(true);
    expect(readiness.bufferEnabled).toBe(true);
    expect(readiness.bufferReadyForProbe).toBe(true);
    expect(readiness.liveProbeRequired).toBe(true);
    expect(readiness.liveVerified).toBe(false);
    expect(readiness.secretValuesExposed).toBe(false);

    const serialized = JSON.stringify(readiness);
    expect(serialized).not.toContain(webhookUrl);
    expect(serialized).not.toContain(bearerToken);
  });
});
