import { describe, expect, it } from 'vitest';
import { evaluateZapierSteering, ZAPIER_STEERING_AUTHORITY } from '../zapierSteeringAuthority.js';

const BASE_REQUEST = {
  zapId: 'founder-signal-engine-day2',
  zapierControlConnected: true,
  openAIDevelopersBridgeAvailable: false,
  bridgeTargetBound: false,
  openAIKeyReferenceAvailable: true,
  steeringGrantId: 'founder-grant-day2-zapier',
  auditEnabled: true,
  founderApprovalId: null,
} as const;

describe('Zapier steering authority', () => {
  it('documents both the native connector and OpenAI Developers bridge paths', () => {
    expect(ZAPIER_STEERING_AUTHORITY.principles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('native Zapier connector'),
        expect.stringContaining('OpenAI Developers bridge'),
        expect.stringContaining('not a Zapier administrator token'),
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

  it('does not treat an OpenAI key alone as a usable Zapier path', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.controlPath).toBe('none');
    expect(result.reason).toContain('No native Zapier connector or ready OpenAI Developers bridge');
  });

  it('allows read-only inspection through a scoped native connector without key use', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'inspect_workflow',
      openAIKeyReferenceAvailable: false,
      steeringGrantId: null,
    });

    expect(result).toMatchObject({
      status: 'allowed',
      controlPath: 'direct_connector',
      openAIKeyRequired: false,
      separateFounderGate: false,
    });
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

  it('allows a scoped OpenAI step through a native connector', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
    });

    expect(result).toMatchObject({
      status: 'allowed',
      zapId: 'founder-signal-engine-day2',
      controlPath: 'direct_connector',
      openAIKeyRequired: true,
      separateFounderGate: false,
    });
  });

  it('allows ChatGPT to invoke the named workflow through the approved bridge', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
      openAIDevelopersBridgeAvailable: true,
      bridgeTargetBound: true,
    });

    expect(result).toMatchObject({
      status: 'allowed',
      controlPath: 'openai_developers_bridge',
      openAIKeyRequired: true,
    });
    expect(result.reason).toContain('existing key reference');
  });

  it('blocks the fallback bridge until it is bound to the named Zapier target', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'test_workflow',
      zapierControlConnected: false,
      openAIDevelopersBridgeAvailable: true,
      bridgeTargetBound: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('not bound to the named Zapier workflow target');
  });

  it('blocks the fallback bridge when the existing dedicated key reference is unavailable', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
      openAIDevelopersBridgeAvailable: true,
      bridgeTargetBound: true,
      openAIKeyReferenceAvailable: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('existing dedicated OpenAI key reference');
  });

  it('does not let the fallback bridge inspect or administer Zapier', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'inspect_workflow',
      zapierControlConnected: false,
      openAIDevelopersBridgeAvailable: true,
      bridgeTargetBound: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.controlPath).toBe('openai_developers_bridge');
    expect(result.reason).toContain('requires direct Zapier control');
  });

  it('blocks the OpenAI step when the dedicated key reference is missing', () => {
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

  it('allows approved CRM writing through the bound bridge', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'write_crm',
      zapierControlConnected: false,
      openAIDevelopersBridgeAvailable: true,
      bridgeTargetBound: true,
      founderApprovalId: 'approval-founder-signal-engine-crm-2026-07-24',
    });

    expect(result).toMatchObject({
      status: 'allowed',
      controlPath: 'openai_developers_bridge',
      separateFounderGate: true,
    });
  });
});
