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
export type ZapierWorkflowControlPath =
  | 'direct_zapier_connector'
  | 'openai_developers_bridge'
  | null;

export interface ZapierSteeringRequest {
  action: ZapierSteeringAction;
  zapId: string | null;
  zapierControlConnected: boolean;
  openAIDevelopersBridgeConnected?: boolean;
  bridgeTargetConfigured?: boolean;
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
  controlPath: ZapierWorkflowControlPath;
  openAIKeyRequired: boolean;
  auditRequired: true;
  separateFounderGate: boolean;
}

export const ZAPIER_STEERING_AUTHORITY = Object.freeze({
  id: 'founder-signal-engine-zapier-steering',
  version: '1.1.0',
  purpose:
    'Allow scoped agents to steer a named Zap through either a direct Zapier control connector or a named OpenAI Developers bridge while keeping raw credentials, external effects, audit, and founder approvals separate.',
  principles: Object.freeze([
    'An OpenAI API key authenticates the OpenAI action; the raw key is never a Zapier control token or blanket authority.',
    'ChatGPT without a native Zapier connector must use the named OpenAI Developers bridge target backed by the provider-held zapier-founder-signal-engine key reference.',
    'A direct Zapier connector or a configured OpenAI Developers bridge target is required to inspect, test, or edit a Zap.',
    'Write steering requires a named Zap, an explicit steering grant, and audit evidence.',
    'A dedicated OpenAI key reference is required before the Zap may execute an OpenAI step, generate a review draft, or use the OpenAI Developers bridge path.',
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

function resolveControlPath(request: ZapierSteeringRequest): ZapierWorkflowControlPath {
  if (request.zapierControlConnected) {
    return 'direct_zapier_connector';
  }

  if (request.openAIDevelopersBridgeConnected && request.bridgeTargetConfigured) {
    return 'openai_developers_bridge';
  }

  return null;
}

function requiresOpenAIKey(
  request: ZapierSteeringRequest,
  controlPath: ZapierWorkflowControlPath,
): boolean {
  return OPENAI_KEY_ACTIONS.has(request.action) || controlPath === 'openai_developers_bridge';
}

function decision(
  request: ZapierSteeringRequest,
  status: ZapierSteeringDecisionStatus,
  reason: string,
  controlPath: ZapierWorkflowControlPath = resolveControlPath(request),
): ZapierSteeringDecision {
  return {
    status,
    reason,
    zapId: request.zapId,
    action: request.action,
    connectorRequired: true,
    controlPath,
    openAIKeyRequired: requiresOpenAIKey(request, controlPath),
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

  const controlPath = resolveControlPath(request);
  if (!controlPath) {
    if (request.openAIDevelopersBridgeConnected && !request.bridgeTargetConfigured) {
      return decision(
        request,
        'blocked',
        'The OpenAI Developers connector is present, but no named Founder Signal Engine Zapier bridge target is configured.',
        null,
      );
    }

    return decision(
      request,
      'blocked',
      'No Zapier workflow-control path is available. Use either a direct Zapier connector or the named OpenAI Developers bridge; a key reference by itself cannot inspect, test, or edit Zapier.',
      null,
    );
  }

  if (requiresOpenAIKey(request, controlPath) && !request.openAIKeyReferenceAvailable) {
    return decision(
      request,
      'blocked',
      controlPath === 'openai_developers_bridge'
        ? 'The ChatGPT bridge path requires the active provider-held zapier-founder-signal-engine key reference.'
        : 'The Zap may be inspected or edited, but its OpenAI step cannot run without a dedicated active key reference.',
      controlPath,
    );
  }

  if (SEPARATE_FOUNDER_GATE_ACTIONS.has(request.action)) {
    if (!hasValue(request.founderApprovalId)) {
      return decision(
        request,
        'founder_gate_required',
        'This action creates an external or provider-level effect and requires a separate founder approval.',
        controlPath,
      );
    }

    return decision(
      request,
      'allowed',
      'The scoped workflow-control path, audit trail, key requirements, and exact founder approval are present.',
      controlPath,
    );
  }

  if (STEERING_GRANT_ACTIONS.has(request.action) && !hasValue(request.steeringGrantId)) {
    return decision(
      request,
      'blocked',
      'Write or execution steering requires an explicit scoped steering grant.',
      controlPath,
    );
  }

  return decision(
    request,
    'allowed',
    controlPath === 'openai_developers_bridge'
      ? 'The named ChatGPT OpenAI Developers bridge is configured, the provider-held key reference is active, and the request is scoped and auditable.'
      : 'The request is scoped, connected, auditable, and within the declared steering grant.',
    controlPath,
  );
}
