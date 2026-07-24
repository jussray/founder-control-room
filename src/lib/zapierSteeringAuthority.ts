export type ZapierSteeringAction =
  | 'inspect_workflow'
  | 'test_workflow'
  | 'edit_workflow'
  | 'run_openai_step'
  | 'queue_review_draft'
  | 'publish_or_send'
  | 'write_crm'
  | 'change_credentials'
  | 'change_billing';

export type ZapierSteeringDecisionStatus = 'allowed' | 'blocked' | 'founder_gate_required';

export interface ZapierSteeringRequest {
  action: ZapierSteeringAction;
  zapId: string | null;
  zapierControlConnected: boolean;
  openAIKeyReferenceAvailable: boolean;
  steeringGrantId: string | null;
  auditEnabled: boolean;
  founderApprovalId?: string | null;
}

export interface ZapierSteeringDecision {
  status: ZapierSteeringDecisionStatus;
  reason: string;
  zapId: string | null;
  action: ZapierSteeringAction;
  connectorRequired: true;
  openAIKeyRequired: boolean;
  auditRequired: true;
  separateFounderGate: boolean;
}

export const ZAPIER_STEERING_AUTHORITY = Object.freeze({
  id: 'founder-signal-engine-zapier-steering',
  version: '1.0.0',
  purpose:
    'Allow scoped agents to steer a named Zap through an authenticated control connector while keeping OpenAI credential use, external effects, audit, and founder approvals separate.',
  principles: Object.freeze([
    'An OpenAI API key authenticates the OpenAI action; it is not a Zapier control token or blanket authority.',
    'A Zapier, automation, browser-control, MCP, or equivalent connector is required to inspect, test, or edit a Zap.',
    'Write steering requires a named Zap, an explicit steering grant, and audit evidence.',
    'A dedicated OpenAI key reference is required before the Zap may execute an OpenAI step or generate a review draft.',
    'Publishing, sending, CRM mutation, credential changes, and billing changes always require a separate founder approval for that exact action.',
    'Raw key values never enter repository files, CRM records, logs, screenshots, prompts, or public evidence.',
  ]),
});

const OPENAI_KEY_ACTIONS: ReadonlySet<ZapierSteeringAction> = new Set([
  'run_openai_step',
  'queue_review_draft',
]);

const STEERING_GRANT_ACTIONS: ReadonlySet<ZapierSteeringAction> = new Set([
  'test_workflow',
  'edit_workflow',
  'run_openai_step',
  'queue_review_draft',
]);

const SEPARATE_FOUNDER_GATE_ACTIONS: ReadonlySet<ZapierSteeringAction> = new Set([
  'publish_or_send',
  'write_crm',
  'change_credentials',
  'change_billing',
]);

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function decision(
  request: ZapierSteeringRequest,
  status: ZapierSteeringDecisionStatus,
  reason: string,
): ZapierSteeringDecision {
  return {
    status,
    reason,
    zapId: request.zapId,
    action: request.action,
    connectorRequired: true,
    openAIKeyRequired: OPENAI_KEY_ACTIONS.has(request.action),
    auditRequired: true,
    separateFounderGate: SEPARATE_FOUNDER_GATE_ACTIONS.has(request.action),
  };
}

export function evaluateZapierSteering(request: ZapierSteeringRequest): ZapierSteeringDecision {
  if (!hasValue(request.zapId)) {
    return decision(request, 'blocked', 'A named Zap ID is required; unscoped automation steering is forbidden.');
  }

  if (!request.auditEnabled) {
    return decision(request, 'blocked', 'An auditable evidence path is required before steering the Zap.');
  }

  if (!request.zapierControlConnected) {
    return decision(
      request,
      'blocked',
      'No Zapier control connector is available. An OpenAI key alone cannot inspect, test, or edit Zapier.',
    );
  }

  if (SEPARATE_FOUNDER_GATE_ACTIONS.has(request.action)) {
    if (!hasValue(request.founderApprovalId)) {
      return decision(
        request,
        'founder_gate_required',
        'This action creates an external or provider-level effect and requires a separate founder approval.',
      );
    }

    return decision(request, 'allowed', 'The scoped connector, audit path, and exact founder approval are present.');
  }

  if (STEERING_GRANT_ACTIONS.has(request.action) && !hasValue(request.steeringGrantId)) {
    return decision(request, 'blocked', 'Write or execution steering requires an explicit scoped steering grant.');
  }

  if (OPENAI_KEY_ACTIONS.has(request.action) && !request.openAIKeyReferenceAvailable) {
    return decision(
      request,
      'blocked',
      'The Zap may be inspected or edited, but its OpenAI step cannot run without a dedicated active key reference.',
    );
  }

  return decision(request, 'allowed', 'The request is scoped, connected, auditable, and within the declared steering grant.');
}
