import { describe, expect, it } from 'vitest';
import { evaluateZapierSteering, ZAPIER_STEERING_AUTHORITY } from '../zapierSteeringAuthority.js';

const BASE_REQUEST = {
  zapId: 'founder-signal-engine-day2',
  zapierControlConnected: true,
  openAIDevelopersBridgeConnected: false,
  openAIKeyReferenceAvailable: true,
  steeringGrantId: 'founder-grant-day2-zapier',
  auditEnabled: true,
  founderApprovalId: null,
} as const;

describe('Zapier steering authority', () => {
  it('documents native Zapier control and the OpenAI Developers fallback bridge', () => {
    expect(ZAPIER_STEERING_AUTHORITY.principles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('native Zapier connector'),
        expect.stringContaining('OpenAI Developers bridge'),
        expect.stringContaining('execution path'),
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

  it('does not treat an OpenAI key reference by itself as an invocation bridge', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('No native Zapier control connector');
    expect(result.controlPath).toBe('none');
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
      controlPath: 'native_zapier_connector',
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

  it('allows a scoped OpenAI step through native Zapier control', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
    });

    expect(result).toMatchObject({
      status: 'allowed',
      zapId: 'founder-signal-engine-day2',
      controlPath: 'native_zapier_connector',
      openAIKeyRequired: true,
      separateFounderGate: false,
    });
  });

  it('allows ChatGPT to invoke a preconfigured Zap through the OpenAI Developers key-backed bridge', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
    });

    expect(result).toMatchObject({
      status: 'allowed',
      controlPath: 'openai_developers_bridge',
      openAIKeyRequired: true,
      nativeZapierControlRequired: false,
    });
    expect(result.reason).toContain('OpenAI Developers key-backed execution bridge');
  });

  it('allows a bridge-backed workflow test when the named key reference, grant, and audit exist', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'test_workflow',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
    });

    expect(result).toMatchObject({
      status: 'allowed',
      controlPath: 'openai_developers_bridge',
      openAIKeyRequired: true,
    });
  });

  it('blocks the bridge when the existing Zapier key reference is unavailable', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
      openAIKeyReferenceAvailable: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('zapier-founder-signal-engine key reference');
  });

  it('does not let the bridge inspect or edit Zapier administration surfaces', () => {
    const inspectResult = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'inspect_workflow',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
    });
    const editResult = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'edit_workflow',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
    });

    expect(inspectResult.status).toBe('blocked');
    expect(editResult.status).toBe('blocked');
    expect(inspectResult.reason).toContain('requires native Zapier');
    expect(editResult.reason).toContain('requires native Zapier');
  });

  it.each(['publish_or_send', 'write_crm', 'change_credentials', 'change_billing'] as const)(
    'requires a separate founder gate for %s',
    action => {
      const result = evaluateZapierSteering({ ...BASE_REQUEST, action });

      expect(result.status).toBe('founder_gate_required');
      expect(result.separateFounderGate).toBe(true);
    },
  );

  it('allows bridge-backed publishing only with an exact founder approval receipt', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'publish_or_send',
      zapierControlConnected: false,
      openAIDevelopersBridgeConnected: true,
      founderApprovalId: 'approval-founder-signal-engine-publish-2026-07-24',
    });

    expect(result).toMatchObject({
      status: 'allowed',
      controlPath: 'openai_developers_bridge',
      separateFounderGate: true,
    });
  });

  it('allows a native external effect only with an exact founder approval receipt', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'write_crm',
      founderApprovalId: 'approval-founder-signal-engine-crm-2026-07-23',
    });

    expect(result.status).toBe('allowed');
    expect(result.separateFounderGate).toBe(true);
  });
});
