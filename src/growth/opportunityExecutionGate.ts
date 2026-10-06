import { createHash } from 'node:crypto';

export const OPPORTUNITY_EXECUTION_GATE_CONTRACT =
  'fcr/opportunity-execution-gate@v1' as const;

export type OpportunityEligibilityState =
  | 'verified_eligible'
  | 'verified_ineligible'
  | 'unknown';

export type OpportunityAiAuthorityState =
  | 'autonomous_explicitly_allowed'
  | 'assistance_explicitly_allowed'
  | 'explicitly_prohibited'
  | 'unknown';

export type OpportunityIdentityRequirement =
  | 'none'
  | 'named_human_required'
  | 'unknown';

export type OpportunityPaymentTermState =
  | 'verified_compensated'
  | 'verified_unpaid'
  | 'unknown';

export type OpportunityExecutionClass =
  | 'autonomous_allowed'
  | 'ai_assisted_allowed'
  | 'human_only'
  | 'ineligible'
  | 'unknown';

export type OpportunityRoutingDecision =
  | 'execute_candidate'
  | 'human_action_required'
  | 'stop_ineligible'
  | 'stop_economics'
  | 'stop_unknown';

export type OpportunityProfitability =
  | 'positive'
  | 'non_positive'
  | 'unknown';

export interface OpportunityExecutionTerms {
  source: string;
  observedAt: string;
  evidenceReferences: string[];
  eligibility: OpportunityEligibilityState;
  aiAuthority: OpportunityAiAuthorityState;
  identityRequirement: OpportunityIdentityRequirement;
  payment: {
    state: OpportunityPaymentTermState;
    expectedGrossCents?: number;
    expectedExternalCostCents?: number;
  };
}

export interface OpportunityExecutionGate {
  contract: typeof OPPORTUNITY_EXECUTION_GATE_CONTRACT;
  source: string | null;
  classification: OpportunityExecutionClass;
  routingDecision: OpportunityRoutingDecision;
  terms: {
    eligibility: OpportunityEligibilityState;
    aiAuthority: OpportunityAiAuthorityState;
    identityRequirement: OpportunityIdentityRequirement;
    paymentState: OpportunityPaymentTermState;
  };
  economics: {
    profitability: OpportunityProfitability;
    expectedGrossCents: number | null;
    expectedExternalCostCents: number | null;
    expectedContributionCents: number | null;
  };
  evidenceReferences: string[];
  reason: string;
  nextGate: string;
  continuity: {
    fingerprint: string;
    evaluatedAt: string;
    termsObservedAt: string | null;
  };
  authority: {
    advisoryOnly: true;
    authorizesAutonomousExecution: false;
    authorizesSubmission: false;
    authorizesIdentityAction: false;
    requiresOpportunitySpecificExecutionGrant: true;
  };
}

const ELIGIBILITY = new Set<OpportunityEligibilityState>([
  'verified_eligible',
  'verified_ineligible',
  'unknown',
]);

const AI_AUTHORITY = new Set<OpportunityAiAuthorityState>([
  'autonomous_explicitly_allowed',
  'assistance_explicitly_allowed',
  'explicitly_prohibited',
  'unknown',
]);

const IDENTITY = new Set<OpportunityIdentityRequirement>([
  'none',
  'named_human_required',
  'unknown',
]);

const PAYMENT = new Set<OpportunityPaymentTermState>([
  'verified_compensated',
  'verified_unpaid',
  'unknown',
]);

const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#?=&-]{2,255}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function exactTimestamp(label: string, value: unknown): string {
  const raw = text(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== raw) {
    throw new Error(`${label} must be an exact ISO-8601 timestamp`);
  }
  return raw;
}

function nonNegativeInteger(label: string, value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer when provided`);
  }
  return value;
}

function evidenceReference(value: unknown, index: number): string {
  const raw = text(value);
  if (!SAFE_REFERENCE.test(raw)) {
    throw new Error(`evidenceReferences[${index}] is missing or malformed`);
  }
  return raw;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function unknownGate(evaluatedAt: string): OpportunityExecutionGate {
  const fingerprint = sha256(JSON.stringify({
    contract: OPPORTUNITY_EXECUTION_GATE_CONTRACT,
    source: null,
    evaluatedAt,
    eligibility: 'unknown',
    aiAuthority: 'unknown',
    identityRequirement: 'unknown',
    paymentState: 'unknown',
  }));

  return {
    contract: OPPORTUNITY_EXECUTION_GATE_CONTRACT,
    source: null,
    classification: 'unknown',
    routingDecision: 'stop_unknown',
    terms: {
      eligibility: 'unknown',
      aiAuthority: 'unknown',
      identityRequirement: 'unknown',
      paymentState: 'unknown',
    },
    economics: {
      profitability: 'unknown',
      expectedGrossCents: null,
      expectedExternalCostCents: null,
      expectedContributionCents: null,
    },
    evidenceReferences: [],
    reason: 'Execution terms are not verified, so the opportunity cannot enter an autonomous or assisted execution lane.',
    nextGate: 'verify_eligibility_payment_ai_terms_and_identity_requirements',
    continuity: {
      fingerprint,
      evaluatedAt,
      termsObservedAt: null,
    },
    authority: {
      advisoryOnly: true,
      authorizesAutonomousExecution: false,
      authorizesSubmission: false,
      authorizesIdentityAction: false,
      requiresOpportunitySpecificExecutionGrant: true,
    },
  };
}

export function evaluateOpportunityExecutionGate(
  terms: OpportunityExecutionTerms | undefined,
  evaluatedAtValue: string,
): OpportunityExecutionGate {
  const evaluatedAt = exactTimestamp('evaluatedAt', evaluatedAtValue);
  if (!terms) return unknownGate(evaluatedAt);
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) {
    throw new Error('executionTerms must be an object when provided');
  }

  const source = text(terms.source);
  if (!source) throw new Error('executionTerms.source is required');
  const observedAt = exactTimestamp('executionTerms.observedAt', terms.observedAt);
  if (Date.parse(observedAt) > Date.parse(evaluatedAt)) {
    throw new Error('executionTerms.observedAt cannot be future-dated');
  }

  if (!Array.isArray(terms.evidenceReferences)) {
    throw new Error('executionTerms.evidenceReferences must be an array');
  }
  const refs = [...new Set(terms.evidenceReferences
    .map((reference, index) => evidenceReference(reference, index)))]
    .sort((a, b) => a.localeCompare(b));

  if (!ELIGIBILITY.has(terms.eligibility)) {
    throw new Error('executionTerms.eligibility is unsupported');
  }
  if (!AI_AUTHORITY.has(terms.aiAuthority)) {
    throw new Error('executionTerms.aiAuthority is unsupported');
  }
  if (!IDENTITY.has(terms.identityRequirement)) {
    throw new Error('executionTerms.identityRequirement is unsupported');
  }
  if (!terms.payment || typeof terms.payment !== 'object' || Array.isArray(terms.payment)) {
    throw new Error('executionTerms.payment is required');
  }
  if (!PAYMENT.has(terms.payment.state)) {
    throw new Error('executionTerms.payment.state is unsupported');
  }

  const expectedGrossCents = nonNegativeInteger(
    'executionTerms.payment.expectedGrossCents',
    terms.payment.expectedGrossCents,
  );
  const expectedExternalCostCents = nonNegativeInteger(
    'executionTerms.payment.expectedExternalCostCents',
    terms.payment.expectedExternalCostCents,
  );

  const anyVerifiedTerm =
    terms.eligibility !== 'unknown'
    || terms.aiAuthority !== 'unknown'
    || terms.identityRequirement !== 'unknown'
    || terms.payment.state !== 'unknown';
  if (anyVerifiedTerm && refs.length === 0) {
    throw new Error('verified execution terms require at least one evidence reference');
  }
  if (terms.payment.state === 'verified_compensated' && expectedGrossCents === null) {
    throw new Error('verified compensated terms require expectedGrossCents');
  }
  if (terms.payment.state === 'verified_unpaid' && expectedGrossCents !== null && expectedGrossCents !== 0) {
    throw new Error('verified unpaid terms cannot declare positive expectedGrossCents');
  }

  let classification: OpportunityExecutionClass;
  if (terms.eligibility === 'verified_ineligible') {
    classification = 'ineligible';
  } else if (terms.eligibility === 'unknown') {
    classification = 'unknown';
  } else if (terms.aiAuthority === 'unknown' || terms.identityRequirement === 'unknown') {
    classification = 'unknown';
  } else if (terms.aiAuthority === 'explicitly_prohibited') {
    classification = 'human_only';
  } else if (terms.aiAuthority === 'assistance_explicitly_allowed') {
    classification = 'ai_assisted_allowed';
  } else if (
    terms.aiAuthority === 'autonomous_explicitly_allowed'
    && terms.identityRequirement === 'none'
  ) {
    classification = 'autonomous_allowed';
  } else if (
    terms.aiAuthority === 'autonomous_explicitly_allowed'
    && terms.identityRequirement === 'named_human_required'
  ) {
    classification = 'ai_assisted_allowed';
  } else {
    classification = 'unknown';
  }

  let profitability: OpportunityProfitability = 'unknown';
  let normalizedGross: number | null = expectedGrossCents;
  let contribution: number | null = null;
  if (terms.payment.state === 'verified_unpaid') {
    normalizedGross = 0;
    if (expectedExternalCostCents !== null) {
      contribution = -expectedExternalCostCents;
    }
    profitability = 'non_positive';
  } else if (
    terms.payment.state === 'verified_compensated'
    && expectedGrossCents !== null
    && expectedExternalCostCents !== null
  ) {
    contribution = expectedGrossCents - expectedExternalCostCents;
    profitability = contribution > 0 ? 'positive' : 'non_positive';
  }

  let routingDecision: OpportunityRoutingDecision;
  let reason: string;
  let nextGate: string;

  if (classification === 'ineligible') {
    routingDecision = 'stop_ineligible';
    reason = 'Verified eligibility terms say this opportunity is not available to the founder.';
    nextGate = 'stop_ineligible';
  } else if (classification === 'unknown') {
    routingDecision = 'stop_unknown';
    reason = 'Eligibility, AI-use authority, or identity requirements are not fully verified.';
    nextGate = 'verify_eligibility_payment_ai_terms_and_identity_requirements';
  } else if (terms.payment.state === 'unknown' || profitability === 'unknown') {
    routingDecision = 'stop_unknown';
    reason = 'Compensation or execution-cost evidence is incomplete, so profitability is not verified.';
    nextGate = 'verify_compensation_and_execution_costs';
  } else if (terms.payment.state === 'verified_unpaid' || profitability === 'non_positive') {
    routingDecision = 'stop_economics';
    reason = 'The opportunity is unpaid or does not have positive expected contribution after verified external costs.';
    nextGate = 'stop_non_profitable_or_unpaid';
  } else if (classification === 'human_only' || classification === 'ai_assisted_allowed') {
    routingDecision = 'human_action_required';
    reason = classification === 'human_only'
      ? 'The opportunity requires human work because external AI execution is explicitly prohibited.'
      : 'AI assistance is permitted, but the opportunity still requires a human-bound action or submission.';
    nextGate = 'route_to_founder_for_required_human_action';
  } else {
    routingDecision = 'execute_candidate';
    reason = 'Eligibility, autonomous AI use, identity requirements, compensation, and positive expected contribution are verified.';
    nextGate = 'obtain_opportunity_specific_execution_grant';
  }

  const fingerprint = sha256(JSON.stringify({
    contract: OPPORTUNITY_EXECUTION_GATE_CONTRACT,
    source,
    observedAt,
    evaluatedAt,
    evidenceReferences: refs,
    eligibility: terms.eligibility,
    aiAuthority: terms.aiAuthority,
    identityRequirement: terms.identityRequirement,
    paymentState: terms.payment.state,
    expectedGrossCents: normalizedGross,
    expectedExternalCostCents,
    profitability,
    classification,
    routingDecision,
  }));

  return {
    contract: OPPORTUNITY_EXECUTION_GATE_CONTRACT,
    source,
    classification,
    routingDecision,
    terms: {
      eligibility: terms.eligibility,
      aiAuthority: terms.aiAuthority,
      identityRequirement: terms.identityRequirement,
      paymentState: terms.payment.state,
    },
    economics: {
      profitability,
      expectedGrossCents: normalizedGross,
      expectedExternalCostCents,
      expectedContributionCents: contribution,
    },
    evidenceReferences: refs,
    reason,
    nextGate,
    continuity: {
      fingerprint,
      evaluatedAt,
      termsObservedAt: observedAt,
    },
    authority: {
      advisoryOnly: true,
      authorizesAutonomousExecution: false,
      authorizesSubmission: false,
      authorizesIdentityAction: false,
      requiresOpportunitySpecificExecutionGrant: true,
    },
  };
}
