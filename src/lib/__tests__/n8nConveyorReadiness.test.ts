import { describe, expect, it } from 'vitest';
import { founderConveyorReadiness } from '../n8nConveyorReadiness.js';

describe('n8n conveyor readiness', () => {
  it('reports not-configured when the provider contract is incomplete', () => {
    expect(founderConveyorReadiness({
      configured: false,
      enabled: false,
      webhookUrl: null,
      bearerToken: null,
    })).toEqual({
      state: 'not-configured',
      configured: false,
      enabled: false,
      liveProbeRequired: true,
      liveVerified: false,
    });
  });

  it('reports ready-for-probe when credentials exist but execution remains disabled', () => {
    expect(founderConveyorReadiness({
      configured: true,
      enabled: false,
      webhookUrl: 'https://n8n.example.com/webhook/fcr',
      bearerToken: 'server-side-secret',
    }).state).toBe('ready-for-probe');
  });

  it('does not call an enabled provider verified without retained live proof', () => {
    expect(founderConveyorReadiness({
      configured: true,
      enabled: true,
      webhookUrl: 'https://n8n.example.com/webhook/fcr',
      bearerToken: 'server-side-secret',
    })).toMatchObject({
      state: 'enabled-awaiting-proof',
      liveProbeRequired: true,
      liveVerified: false,
    });
  });
});
