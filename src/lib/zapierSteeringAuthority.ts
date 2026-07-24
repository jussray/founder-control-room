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

export type ZapierSteeringControlPath =
  | 'native_zapier_connector'
  | 'openai_developers_bridge'
  | 'none';

export interface ZapierSteeringRequest {
  action: ZapierSteeringAction;
  zapId: string | null;
  zapierControlConnected: boolean;
  openAIDevelopersBridgeConnected?: boolean;
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
  controlPath: ZapierSteeringControlPath;
  nativeZapierControlRequired: boolean;
  openAIKeyRequired: boolean;
  auditRequired: true;
  separateFounderGate: boolean;
}

export const ZAPIER_STEERING_AUTHORITY = Object.freeze({
  id: 'founder-signal-engine-zapier-steering',
  version: '1.1.0',
  purpose:
    'Allow scoped agents to operate a named Founder Signal Engine Zap through either native Zapier control or the preconfigured OpenAI Developers key-backed execution bridge while preserving audit and founder approval boundaries.',
  principles: Object.freeze([
    'Claude or another agent with a native Zapier connector should use that connector as the full control path.',
    'ChatGPT or another approved agent without native Zapier control must use the existing OpenAI Developers bridge backed by the zapier-founder-signal-engine key reference to invoke the preconfigured Zap.',
    'The key-backed bridge is an execution path, not blanket Zapier administrator authority; inspecting or editing Zap structure still requires native Zapier or equivalent control.',
    'A key reference is never pasted into prompts or payloads; the provider-held connection resolves it securely.',
    'Write or execution steering requires a named Zap, an explicit steering grant, and audit evidence.',
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

const NATIVE_ZAPIER_CONTROL_ACTIONS: ReadonlySet<ZapierSteeringAction> = new Set([
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

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveControlPath(request: ZapierSteeringRequest): ZapierSteeringControlPath {
  if (request.zapierControlConnected) {
    return 'native_zapier_connector';
  }

  if (request.openAIDevelopersBridgeConnected) {
    return 'openai_developers_bridge';
  }

  return 'none';
}

function decision(
  request: ZapierSteeringRequest,
  status: ZapierSteeringDecisionStatus,
  reason: string,
): ZapierSteeringDecision {
  const controlPath = resolveControlPath(request);
  const bridgeUsesKey = controlPath === 'openai_developers_bridge';

  return {
    status,
    reason,
    zapId: request.zapId,
    action: request.action,
    connectorRequired: true,
    controlPath,
    nativeZapierControlRequired: NATIVE_ZAPIER_CONTROL_ACTIONS.has(request.action),
    openAIKeyRequired: bridgeUsesKey || OPENAI_KEY_ACTIONS.has(request.action),
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

  const nativeControlRequired = NATIVE_ZAPIER_CONTROL_ACTIONS.has(request.action);
  const bridgeConnected = request.openAIDevelopersBridgeConnected === true;

  if (nativeControlRequired && !request.zapierControlConnected) {
    return decision(
      request,
      'blocked',
      'This action requires native Zapier or equivalent workflow-control access; the OpenAI Developers bridge can invoke a preconfigured Zap but cannot administer its structure, credentials, or billing.',
    );
  }

  if (!request.zapierControlConnected) {
    if (!BRIDGE_EXECUTION_ACTIONS.has(request.action) || !bridgeConnected) {
      return decision(
        request,
        'blocked',
        'No native Zapier control connector or configured OpenAI Developers execution bridge is available.',
      );
    }

    if (!request.openAIKeyReferenceAvailable) {
      return decision(
        request,
        'blocked',
        'The OpenAI Developers Zapier bridge requires the existing zapier-founder-signal-engine key reference.',
      );
    }
  }

  if (SEPARATE_FOUNDER_GATE_ACTIONS.has(request.action)) {
    if (!hasValue(request.founderApprovalId)) {
      return decision(
        request,
        'founder_gate_required',
        'This action creates an external or provider-level effect and requires a separate founder approval.',
      );
    }

    return decision(request, 'allowed', 'The scoped execution path, audit trail, and exact founder approval are present.');
  }

  if (STEERING_GRANT_ACTIONS.has(request.action) && !hasValue(request.steeringGrantId)) {
    return decision(request, 'blocked', 'Write or execution steering requires an explicit scoped steering grant.');
  }

  if (OPENAI_KEY_ACTIONS.has(request.action) && !request.openAIKeyReferenceAvailable) {
    return decision(
      request,
      'blocked',
      'The Zap may be inspected or edited, but its OpenAI step cannot run without the dedicated active key reference.',
    );
  }

  const pathLabel = request.zapierControlConnected
    ? 'native Zapier control connector'
    : 'OpenAI Developers key-backed execution bridge';

  return decision(
    request,
    'allowed',
    `The request is scoped, auditable, and authorized through the ${pathLabel}.`,
  );
}
