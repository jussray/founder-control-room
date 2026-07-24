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
  bridgeAllowedActions?: readonly ZapierSteeringAction[];
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
    'Allow scoped agents to steer a named Zap through either a direct Zapier control connector or an approved OpenAI Developers invocation bridge while keeping raw credentials, external effects, audit, and founder approvals separate.',
  principles: Object.freeze([
    'An OpenAI API key authenticates the OpenAI action; the raw key is never a Zapier control token or blanket authority.',
    'ChatGPT without a native Zapier connector must use an approved Catch Hook, webhook, or named OpenAI Developers bridge backed by the provider-held zapier-founder-signal-engine key reference.',
    'A direct Zapier connector or configured invocation bridge is required before an agent may call the named Zap.',
    'A bridge may perform only the actions it explicitly exposes; invocation access does not silently grant arbitrary inspection or editing.',
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

function bridgeAllowsAction(request: ZapierSteeringRequest): boolean {
  return request.bridgeAllowedActions?.includes(request.action) ?? false;
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
        'The OpenAI Developers connector is present, but no approved Founder Signal Engine Catch Hook, webhook, or named bridge target is configured.',
        null,
      );
    }

    return decision(
      request,
      'blocked',
      'No Zapier invocation or control path is available. Use either a direct Zapier connector or an approved OpenAI Developers bridge; a key reference by itself cannot call, inspect, test, or edit Zapier.',
      null,
    );
  }

  if (controlPath === 'openai_developers_bridge' && !bridgeAllowsAction(request)) {
    return decision(
      request,
      'blocked',
      `The configured OpenAI Developers bridge does not explicitly expose the requested action: ${request.action}.`,
      controlPath,
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
      'The scoped invocation path, audit trail, key requirements, and exact founder approval are present.',
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
      ? 'The approved ChatGPT OpenAI Developers invocation path is configured, the provider-held key reference is active, and the requested bridge capability is scoped and auditable.'
      : 'The request is scoped, connected, auditable, and within the declared steering grant.',
    controlPath,
  );
}
