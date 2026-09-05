export const FOUNDER_PROOF_AUDIT_LIFECYCLE_CONTRACT = 'fcr/founder-proof-audit-lifecycle@v1' as const;

export type FounderProofAuditMode = 'DRY_RUN' | 'LIVE';
export type FounderProofAuditTargetType =
  | 'WEBSITE'
  | 'AI_WORKFLOW'
  | 'AUTOMATION'
  | 'SAAS_FEATURE'
  | 'CHECKOUT_PATH'
  | 'DEPLOYMENT';
export type FounderProofAuditCommerceStatus = 'NOT_EXECUTED' | 'ORDER_CREATED' | 'PAYMENT_VERIFIED';
export type FounderProofAuditIntakeStatus = 'MISSING' | 'VALIDATED';
export type FounderProofAuditExecutionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type FounderProofAuditDeliveryStatus = 'NOT_DELIVERED' | 'SIMULATED' | 'DELIVERED' | 'ACKNOWLEDGED';
export type FounderProofAuditTruthPlane = 'INTENT' | 'COMMERCE_EXECUTION' | 'AUDIT_EXECUTION' | 'DELIVERY_OUTCOME';

export interface FounderProofAuditLifecycleInput {
  mode: FounderProofAuditMode;
  auditId: string;
  scope: {
    targetType: FounderProofAuditTargetType;
    targetRef: string;
    objective: string;
    authorizedEvidenceRefs: string[];
    productionMutationAuthorizationRef?: string | null;
  };
  commerce: {
    status: FounderProofAuditCommerceStatus;
    source: 'shopify' | 'none';
    evidenceRef?: string | null;
  };
  intake: {
    status: FounderProofAuditIntakeStatus;
    evidenceRef?: string | null;
  };
  audit: {
    status: FounderProofAuditExecutionStatus;
    evidenceRef?: string | null;
  };
  delivery: {
    status: FounderProofAuditDeliveryStatus;
    evidenceRef?: string | null;
    customerEvidenceRef?: string | null;
  };
}

export interface FounderProofAuditLifecycleReceipt {
  contract: typeof FOUNDER_PROOF_AUDIT_LIFECYCLE_CONTRACT;
  auditId: string;
  mode: FounderProofAuditMode;
  disposition:
    | 'HOLD'
    | 'READY_FOR_AUDIT'
    | 'AUDIT_IN_PROGRESS'
    | 'AWAITING_DELIVERY'
    | 'DRY_RUN_VERIFIED'
    | 'DELIVERED_UNACKNOWLEDGED'
    | 'DELIVERY_ACKNOWLEDGED';
  highestTruthPlane: FounderProofAuditTruthPlane;
  recognizedOutcome: string;
  claims: {
    commerceExecutionVerified: boolean;
    auditExecutionVerified: boolean;
    deliverySimulationVerified: boolean;
    deliveryOutcomeVerified: boolean;
    customerReceiptAcknowledged: boolean;
    customerValueOutcomeVerified: false;
  };
  authority: {
    observationOnly: true;
    canMutateProduction: false;
    canBypassAccessControls: false;
    canExpandScope: false;
    productionMutationAuthorizationRecorded: boolean;
  };
  nextGate: string;
}

const ID = /^[a-z0-9][a-z0-9._:-]{0,159}$/;
const MODES: FounderProofAuditMode[] = ['DRY_RUN', 'LIVE'];
const TARGET_TYPES: FounderProofAuditTargetType[] = [
  'WEBSITE',
  'AI_WORKFLOW',
  'AUTOMATION',
  'SAAS_FEATURE',
  'CHECKOUT_PATH',
  'DEPLOYMENT',
];
const COMMERCE_STATUSES: FounderProofAuditCommerceStatus[] = ['NOT_EXECUTED', 'ORDER_CREATED', 'PAYMENT_VERIFIED'];
const INTAKE_STATUSES: FounderProofAuditIntakeStatus[] = ['MISSING', 'VALIDATED'];
const AUDIT_STATUSES: FounderProofAuditExecutionStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];
const DELIVERY_STATUSES: FounderProofAuditDeliveryStatus[] = ['NOT_DELIVERED', 'SIMULATED', 'DELIVERED', 'ACKNOWLEDGED'];
const COMMERCE_SOURCES = ['shopify', 'none'] as const;

function text(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function reject(errors: string[]): never {
  const error = new Error(`FOUNDER_PROOF_AUDIT_REJECTED: ${errors.join('; ')}`);
  (error as Error & { code?: string; details?: string[] }).code = 'FOUNDER_PROOF_AUDIT_REJECTED';
  (error as Error & { code?: string; details?: string[] }).details = errors;
  throw error;
}

export function evaluateFounderProofAuditLifecycle(
  input: FounderProofAuditLifecycleInput,
): FounderProofAuditLifecycleReceipt {
  const errors: string[] = [];
  const auditId = text(input?.auditId, 160).toLowerCase();
  const targetRef = text(input?.scope?.targetRef);
  const objective = text(input?.scope?.objective, 600);
  const authorizedEvidenceRefs = Array.isArray(input?.scope?.authorizedEvidenceRefs)
    ? input.scope.authorizedEvidenceRefs.map((item) => text(item)).filter(Boolean)
    : [];
  const productionMutationAuthorizationRef = text(input?.scope?.productionMutationAuthorizationRef || '') || null;
  const commerceEvidenceRef = text(input?.commerce?.evidenceRef || '') || null;
  const intakeEvidenceRef = text(input?.intake?.evidenceRef || '') || null;
  const auditEvidenceRef = text(input?.audit?.evidenceRef || '') || null;
  const deliveryEvidenceRef = text(input?.delivery?.evidenceRef || '') || null;
  const customerEvidenceRef = text(input?.delivery?.customerEvidenceRef || '') || null;

  if (!MODES.includes(input?.mode)) errors.push('mode is invalid');
  if (!ID.test(auditId)) errors.push('auditId is invalid');
  if (!TARGET_TYPES.includes(input?.scope?.targetType)) errors.push('scope.targetType is invalid');
  if (!targetRef) errors.push('scope.targetRef is required');
  if (!objective) errors.push('scope.objective is required');
  if (authorizedEvidenceRefs.length === 0) errors.push('scope.authorizedEvidenceRefs must contain at least one authorized evidence reference');
  if (!COMMERCE_STATUSES.includes(input?.commerce?.status)) errors.push('commerce.status is invalid');
  if (!COMMERCE_SOURCES.includes(input?.commerce?.source)) errors.push('commerce.source is invalid');
  if (!INTAKE_STATUSES.includes(input?.intake?.status)) errors.push('intake.status is invalid');
  if (!AUDIT_STATUSES.includes(input?.audit?.status)) errors.push('audit.status is invalid');
  if (!DELIVERY_STATUSES.includes(input?.delivery?.status)) errors.push('delivery.status is invalid');
  if (errors.length > 0) reject(errors);

  if (input.mode === 'DRY_RUN') {
    if (input.commerce.status !== 'NOT_EXECUTED' || input.commerce.source !== 'none') {
      errors.push('DRY_RUN may not claim Shopify order or payment execution');
    }
    if (input.delivery.status === 'DELIVERED' || input.delivery.status === 'ACKNOWLEDGED') {
      errors.push('DRY_RUN may not claim customer delivery or acknowledgement');
    }
  }

  if (input.commerce.status === 'NOT_EXECUTED') {
    if (input.commerce.source !== 'none') errors.push('NOT_EXECUTED commerce must use source none');
  } else {
    if (input.commerce.source !== 'shopify') errors.push('ORDER_CREATED and PAYMENT_VERIFIED must be certified by Shopify');
    if (!commerceEvidenceRef) errors.push('commerce evidenceRef is required once commerce execution is claimed');
  }

  if (input.intake.status === 'VALIDATED' && !intakeEvidenceRef) {
    errors.push('validated intake requires evidenceRef');
  }

  if (input.audit.status !== 'NOT_STARTED') {
    if (input.intake.status !== 'VALIDATED') errors.push('audit execution requires validated intake');
    if (!auditEvidenceRef) errors.push('audit execution requires evidenceRef');
    if (input.mode === 'LIVE' && input.commerce.status !== 'PAYMENT_VERIFIED') {
      errors.push('LIVE audit execution requires independently verified Shopify payment');
    }
  }

  if (input.delivery.status !== 'NOT_DELIVERED') {
    if (input.audit.status !== 'COMPLETED') errors.push('delivery requires a completed audit');
    if (!deliveryEvidenceRef) errors.push('delivery requires evidenceRef');
  }

  if (input.delivery.status === 'SIMULATED' && input.mode !== 'DRY_RUN') {
    errors.push('SIMULATED delivery is only valid in DRY_RUN mode');
  }
  if ((input.delivery.status === 'DELIVERED' || input.delivery.status === 'ACKNOWLEDGED') && input.mode !== 'LIVE') {
    errors.push('real delivery states require LIVE mode');
  }
  if (input.delivery.status === 'ACKNOWLEDGED' && !customerEvidenceRef) {
    errors.push('ACKNOWLEDGED delivery requires independent customer evidence');
  }

  if (errors.length > 0) reject(errors);

  const commerceExecutionVerified = input.mode === 'LIVE' && input.commerce.status === 'PAYMENT_VERIFIED';
  const auditExecutionVerified = input.audit.status === 'COMPLETED';
  const deliverySimulationVerified = input.mode === 'DRY_RUN' && input.delivery.status === 'SIMULATED';
  const deliveryOutcomeVerified = input.mode === 'LIVE'
    && (input.delivery.status === 'DELIVERED' || input.delivery.status === 'ACKNOWLEDGED');
  const customerReceiptAcknowledged = input.mode === 'LIVE' && input.delivery.status === 'ACKNOWLEDGED';

  let disposition: FounderProofAuditLifecycleReceipt['disposition'] = 'HOLD';
  let highestTruthPlane: FounderProofAuditTruthPlane = 'INTENT';
  let recognizedOutcome = 'Audit intent and bounded scope are recorded; execution is not yet proven.';
  let nextGate = input.intake.status === 'VALIDATED' ? 'Acquire the next required execution proof.' : 'Validate bounded intake without collecting secrets.';

  if (input.mode === 'DRY_RUN' && input.audit.status === 'COMPLETED' && deliverySimulationVerified) {
    disposition = 'DRY_RUN_VERIFIED';
    highestTruthPlane = 'AUDIT_EXECUTION';
    recognizedOutcome = 'Dry-run intake and audit execution were verified, and the delivery boundary was simulated; no Shopify payment or customer delivery occurred.';
    nextGate = 'Reacquire the same lifecycle in LIVE mode only after payment authority and customer-facing policy gates are verified.';
  } else if (customerReceiptAcknowledged) {
    disposition = 'DELIVERY_ACKNOWLEDGED';
    highestTruthPlane = 'DELIVERY_OUTCOME';
    recognizedOutcome = 'Customer receipt acknowledgement was independently observed; customer value or business outcome is not proven.';
    nextGate = 'Measure any claimed customer value separately with outcome-plane evidence.';
  } else if (deliveryOutcomeVerified) {
    disposition = 'DELIVERED_UNACKNOWLEDGED';
    highestTruthPlane = 'DELIVERY_OUTCOME';
    recognizedOutcome = 'Audit delivery was verified; customer receipt acknowledgement and customer value are not proven.';
    nextGate = 'Acquire independent customer acknowledgement if needed.';
  } else if (auditExecutionVerified) {
    disposition = 'AWAITING_DELIVERY';
    highestTruthPlane = 'AUDIT_EXECUTION';
    recognizedOutcome = 'Audit completion was verified; delivery is not yet proven.';
    nextGate = input.mode === 'DRY_RUN' ? 'Simulate the delivery boundary without contacting a customer.' : 'Deliver through an authorized channel and preserve delivery evidence.';
  } else if (input.audit.status === 'IN_PROGRESS') {
    disposition = 'AUDIT_IN_PROGRESS';
    highestTruthPlane = 'AUDIT_EXECUTION';
    recognizedOutcome = 'Audit execution is in progress; completion and delivery are not proven.';
    nextGate = 'Complete the audit and preserve exact completion evidence.';
  } else if (input.mode === 'LIVE' && commerceExecutionVerified && input.intake.status === 'VALIDATED') {
    disposition = 'READY_FOR_AUDIT';
    highestTruthPlane = 'COMMERCE_EXECUTION';
    recognizedOutcome = 'Shopify payment execution and bounded intake were verified; audit completion and delivery are not proven.';
    nextGate = 'Execute the bounded audit without expanding authority.';
  } else if (input.mode === 'LIVE' && commerceExecutionVerified) {
    highestTruthPlane = 'COMMERCE_EXECUTION';
    recognizedOutcome = 'Shopify payment execution was verified; audit intake, completion, and delivery are not proven.';
    nextGate = 'Validate bounded intake without collecting secrets.';
  }

  return Object.freeze({
    contract: FOUNDER_PROOF_AUDIT_LIFECYCLE_CONTRACT,
    auditId,
    mode: input.mode,
    disposition,
    highestTruthPlane,
    recognizedOutcome,
    claims: Object.freeze({
      commerceExecutionVerified,
      auditExecutionVerified,
      deliverySimulationVerified,
      deliveryOutcomeVerified,
      customerReceiptAcknowledged,
      customerValueOutcomeVerified: false as const,
    }),
    authority: Object.freeze({
      observationOnly: true as const,
      canMutateProduction: false as const,
      canBypassAccessControls: false as const,
      canExpandScope: false as const,
      productionMutationAuthorizationRecorded: Boolean(productionMutationAuthorizationRef),
    }),
    nextGate,
  });
}
