import { describe, expect, it } from 'vitest';
import { founderContentOrchestrationReadiness } from './n8nConveyorReadiness.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const verifiedBufferProof = {
  state: 'verified' as const,
  provider: 'buffer' as const,
  receiptId: 'buffer-live-proof-123',
  expectedHeadSha: SHA_A,
  observedAt: '2026-08-26T04:00:00.000Z',
};

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
      proof: {
        state: 'not-observed',
        provider: null,
        receiptId: null,
        expectedHeadSha: null,
        observedAt: null,
      },
      secretValuesExposed: false,
    });
  });

  it('separates configured-but-disabled readiness from live proof', () => {
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'provider-secret-token',
      GIT_SHA: SHA_A,
    }, verifiedBufferProof);

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
      GIT_SHA: SHA_A,
    }, verifiedBufferProof);

    expect(readiness.state).toBe('enabled-misconfigured');
    expect(readiness.enabled).toBe(true);
    expect(readiness.configured).toBe(false);
    expect(readiness.webhookConfigured).toBe(true);
    expect(readiness.bearerTokenConfigured).toBe(false);
    expect(readiness.bufferReadyForProbe).toBe(false);
    expect(readiness.liveVerified).toBe(false);
  });

  it('fails visibly on unsupported provider allowlist entries', () => {
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'provider-secret-token',
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer,not-a-provider',
      GIT_SHA: SHA_A,
    }, verifiedBufferProof);

    expect(readiness.state).toBe('invalid-provider-configuration');
    expect(readiness.invalidProviders).toEqual(['not-a-provider']);
    expect(readiness.bufferEnabled).toBe(true);
    expect(readiness.bufferReadyForProbe).toBe(false);
    expect(readiness.liveVerified).toBe(false);
  });

  it('marks Buffer ready only for a controlled probe when live proof is missing', () => {
    const webhookUrl = 'https://n8n.example/webhook/private-founder-content-path';
    const bearerToken = 'provider-secret-token';
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: webhookUrl,
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: bearerToken,
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
      GIT_SHA: SHA_A,
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

  it('promotes founder-content readiness only with exact-head verified Buffer proof', () => {
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'provider-secret-token',
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
      GIT_SHA: SHA_A,
    }, verifiedBufferProof);

    expect(readiness.state).toBe('enabled-live-verified');
    expect(readiness.liveVerified).toBe(true);
    expect(readiness.liveProbeRequired).toBe(false);
    expect(readiness.bufferReadyForProbe).toBe(false);
    expect(readiness.proof).toEqual(verifiedBufferProof);
  });

  it('refuses to inherit verified proof from a stale runtime head', () => {
    const readiness = founderContentOrchestrationReadiness({
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'provider-secret-token',
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
      GIT_SHA: SHA_B,
    }, verifiedBufferProof);

    expect(readiness.state).toBe('enabled-awaiting-proof');
    expect(readiness.liveVerified).toBe(false);
    expect(readiness.liveProbeRequired).toBe(true);
    expect(readiness.bufferReadyForProbe).toBe(true);
  });

  it('does not promote an unbound or unavailable provider proof', () => {
    const env = {
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'provider-secret-token',
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
      GIT_SHA: SHA_A,
    };

    const providerUnverified = founderContentOrchestrationReadiness(env, {
      ...verifiedBufferProof,
      state: 'provider-unverified',
    });
    const noProviderBinding = founderContentOrchestrationReadiness(env, {
      ...verifiedBufferProof,
      provider: null,
    });

    expect(providerUnverified.liveVerified).toBe(false);
    expect(providerUnverified.state).toBe('enabled-awaiting-proof');
    expect(noProviderBinding.liveVerified).toBe(false);
    expect(noProviderBinding.state).toBe('enabled-awaiting-proof');
  });
});
