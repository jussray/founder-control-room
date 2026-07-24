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
export type ZapierSteeringControlPath = 'direct_connector' | 'openai_developers_bridge' | 'none';

export interface ZapierSteeringRequest {
  action: ZapierSteeringAction;
  zapId: string | null;
  zapierControlConnected: boolean;
  openAIDevelopersBridgeAvailable?: boolean;
  bridgeTargetBound?: boolean;
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
  controlPath: ZapierSteeringControlPath;
  connectorRequired: boolean;
  openAIKeyRequired: boolean;
  auditRequired: true;
  separateFounderGate: boolean;
}

export const ZAPIER_STEERING_AUTHORITY = Object.freeze({
  id: 'founder-signal-engine-zapier-steering',
  version: '1.1.0',
  purpose:
    'Allow scoped agents to steer a named Zap through either a native Zapier control connector or the approved OpenAI Developers bridge, while keeping credentials, external effects, audit, and founder approvals separate.',
  principles: Object.freeze([
    'The dedicated OpenAI key authenticates OpenAI-backed bridge calls and the OpenAI step inside Zapier; the raw key is never exposed to the acting agent.',
    'A native Zapier connector is the preferred control path for inspection, editing, and run-history access.',
    'When an agent has no native Zapier connector, it must use the approved OpenAI Developers bridge only when that bridge is already bound to the named Zapier workflow target.',
    'An API key by itself is not a Zapier administrator token; the key must be used through an authorized bridge or provider-held connection.',
    'Write steering requires a named Zap, an explicit steering grant, and audit evidence.',
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

const DIRECT_CONNECTOR_ONLY_ACTIONS: ReadonlySet<ZapierSteeringAction> = new Set([
  'inspect_workflow',
  'edit_workflow',
  'change_credentials',
  'change_billing',
]);

const BRIDGE_EXECUTION_ACTIONS: ReadonlySet<ZapierSteeringAction> = new Set([
  'test_workflow',
  'run_openai_step',
  'queue_review_draft',
  'publish_or_send',
  'write_crm',
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

function resolveControlPath(request: ZapierSteeringRequest): ZapierSteeringControlPath {
  if (request.zapierControlConnected) {
    return 'direct_connector';
  }

  if (
    request.openAIDevelopersBridgeAvailable === true
    && request.bridgeTargetBound === true
    && request.openAIKeyReferenceAvailable
  ) {
    return 'openai_developers_bridge';
  }

  return 'none';
}

function decision(
  request: ZapierSteeringRequest,
  status: ZapierSteeringDecisionStatus,
  reason: string,
  controlPath: ZapierSteeringControlPath = resolveControlPath(request),
): ZapierSteeringDecision {
  return {
    status,
    reason,
    zapId: request.zapId,
    action: request.action,
    controlPath,
    connectorRequired: controlPath === 'direct_connector' || DIRECT_CONNECTOR_ONLY_ACTIONS.has(request.action),
    openAIKeyRequired:
      OPENAI_KEY_ACTIONS.has(request.action) || controlPath === 'openai_developers_bridge',
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

  if (controlPath === 'none') {
    if (
      request.openAIDevelopersBridgeAvailable === true
      && request.bridgeTargetBound !== true
    ) {
      return decision(
        request,
        'blocked',
        'The OpenAI Developers bridge is available, but it is not bound to the named Zapier workflow target.',
        controlPath,
      );
    }

    if (
      request.openAIDevelopersBridgeAvailable === true
      && !request.openAIKeyReferenceAvailable
    ) {
      return decision(
        request,
        'blocked',
        'The OpenAI Developers bridge cannot run without the existing dedicated OpenAI key reference.',
        controlPath,
      );
    }

    return decision(
      request,
      'blocked',
      'No native Zapier connector or ready OpenAI Developers bridge is available for the named workflow.',
      controlPath,
    );
  }

  if (controlPath === 'openai_developers_bridge' && DIRECT_CONNECTOR_ONLY_ACTIONS.has(request.action)) {
    return decision(
      request,
      'blocked',
      'This action requires direct Zapier control. The OpenAI Developers bridge may invoke the named workflow but cannot inspect or administer Zapier.',
      controlPath,
    );
  }

  if (controlPath === 'openai_developers_bridge' && !BRIDGE_EXECUTION_ACTIONS.has(request.action)) {
    return decision(
      request,
      'blocked',
      'The requested action is outside the approved OpenAI Developers bridge execution scope.',
      controlPath,
    );
  }

  if (STEERING_GRANT_ACTIONS.has(request.action) && !hasValue(request.steeringGrantId)) {
    return decision(request, 'blocked', 'Write or execution steering requires an explicit scoped steering grant.', controlPath);
  }

  if (OPENAI_KEY_ACTIONS.has(request.action) && !request.openAIKeyReferenceAvailable) {
    return decision(
      request,
      'blocked',
      'The Zap may be inspected or edited, but its OpenAI step cannot run without the existing dedicated active key reference.',
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
      'The scoped control path, audit trail, and exact founder approval are present.',
      controlPath,
    );
  }

  return decision(
    request,
    'allowed',
    controlPath === 'openai_developers_bridge'
      ? 'The named Zap may be invoked through the approved OpenAI Developers bridge using the existing key reference and audit path.'
      : 'The request is scoped, connected, auditable, and within the declared steering grant.',
    controlPath,
  );
}
