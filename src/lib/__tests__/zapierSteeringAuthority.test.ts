import { describe, expect, it } from 'vitest';
import { evaluateZapierSteering, ZAPIER_STEERING_AUTHORITY } from '../zapierSteeringAuthority.js';

const BASE_REQUEST = {
  zapId: 'founder-signal-engine-day2',
  zapierControlConnected: true,
  openAIDevelopersBridgeConnected: false,
  bridgeTargetConfigured: false,
  bridgeAllowedActions: [] as const,
  openAIKeyReferenceAvailable: true,
  steeringGrantId: 'founder-grant-day2-zapier',
  auditEnabled: true,
  founderApprovalId: null,
} as const;

describe('Zapier steering authority', () => {
  it('keeps the raw API key and Zapier invocation path as separate capabilities', () => {
    expect(ZAPIER_STEERING_AUTHORITY.principles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('never a Zapier control token'),
        expect.stringContaining('OpenAI Developers bridge'),
      ]),
    );
  });

  it('blocks unscoped steering even when connector and key are present', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'edit_workflow',
      zapId: null,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('named Zap ID');
  });

  it('blocks steering when audit is unavailable', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'test_workflow',
      auditEnabled: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.auditRequired).toBe(true);
  });

  it('does not treat an OpenAI API key by itself as Zapier invocation authority', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('key reference by itself');
    expect(result.controlPath).toBeNull();
  });

  it('allows read-only inspection through a scoped direct connector without key use', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'inspect_workflow',
      openAIKeyReferenceAvailable: false,
      steeringGrantId: null,
    });

    expect(result).toMatchObject({
      status: 'allowed',
      controlPath: 'direct_zapier_connector',
      openAIKeyRequired: false,
      separateFounderGate: false,
    });
  });

  it('allows ChatGPT to call an explicitly exposed action through the OpenAI Developers bridge', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
      bridgeTargetConfigured: true,
      bridgeAllowedActions: ['run_openai_step'],
    });

    expect(result).toMatchObject({
      status: 'allowed',
      controlPath: 'openai_developers_bridge',
      openAIKeyRequired: true,
    });
  });

  it('blocks the OpenAI Developers path when the approved target is missing', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
      bridgeTargetConfigured: false,
      bridgeAllowedActions: ['run_openai_step'],
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('no approved Founder Signal Engine');
    expect(result.controlPath).toBeNull();
  });

  it('blocks actions the bridge does not explicitly expose', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'edit_workflow',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
      bridgeTargetConfigured: true,
      bridgeAllowedActions: ['run_openai_step'],
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('does not explicitly expose');
    expect(result.controlPath).toBe('openai_developers_bridge');
  });

  it('blocks the bridge when its provider-held key reference is unavailable', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
      bridgeTargetConfigured: true,
      bridgeAllowedActions: ['run_openai_step'],
      openAIKeyReferenceAvailable: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('zapier-founder-signal-engine key reference');
  });

  it('requires an explicit steering grant for workflow edits', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'edit_workflow',
      steeringGrantId: null,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('steering grant');
  });

  it('allows a scoped OpenAI step when direct connector, key reference, grant, and audit exist', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
    });

    expect(result).toMatchObject({
      status: 'allowed',
      zapId: 'founder-signal-engine-day2',
      controlPath: 'direct_zapier_connector',
      openAIKeyRequired: true,
      separateFounderGate: false,
    });
  });

  it('blocks the direct OpenAI step when the dedicated key reference is missing', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      openAIKeyReferenceAvailable: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('dedicated active key reference');
  });

  it.each(['publish_or_send', 'write_crm', 'change_credentials', 'change_billing'] as const)(
    'requires a separate founder gate for %s',
    action => {
      const result = evaluateZapierSteering({ ...BASE_REQUEST, action });

      expect(result.status).toBe('founder_gate_required');
      expect(result.separateFounderGate).toBe(true);
    },
  );

  it('allows an external effect only with an exact founder approval receipt', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'write_crm',
      founderApprovalId: 'approval-founder-signal-engine-crm-2026-07-23',
    });

    expect(result.status).toBe('allowed');
    expect(result.separateFounderGate).toBe(true);
  });
});
