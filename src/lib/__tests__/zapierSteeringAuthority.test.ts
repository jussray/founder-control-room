import { describe, expect, it } from 'vitest';
import { evaluateZapierSteering, ZAPIER_STEERING_AUTHORITY } from '../zapierSteeringAuthority.js';

const BASE_REQUEST = {
  zapId: 'founder-signal-engine-day2',
  zapierControlConnected: true,
  openAIKeyReferenceAvailable: true,
  steeringGrantId: 'founder-grant-day2-zapier',
  auditEnabled: true,
  founderApprovalId: null,
} as const;

describe('Zapier steering authority', () => {
  it('keeps the API key and Zapier control path as separate capabilities', () => {
    expect(ZAPIER_STEERING_AUTHORITY.principles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('not a Zapier control token'),
        expect.stringContaining('connector is required'),
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

  it('does not treat an OpenAI API key as Zapier control authority', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
      zapierControlConnected: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('key alone cannot');
  });

  it('allows read-only inspection through a scoped connector without key use', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'inspect_workflow',
      openAIKeyReferenceAvailable: false,
      steeringGrantId: null,
    });

    expect(result).toMatchObject({
      status: 'allowed',
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

  it('allows a scoped OpenAI step when connector, key reference, grant, and audit exist', () => {
    const result = evaluateZapierSteering({
      ...BASE_REQUEST,
      action: 'run_openai_step',
    });

    expect(result).toMatchObject({
      status: 'allowed',
      zapId: 'founder-signal-engine-day2',
      openAIKeyRequired: true,
      separateFounderGate: false,
    });
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
});
