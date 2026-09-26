import { createHash } from 'node:crypto';
import {
  isCollectedRevenue,
  type LeadRecord,
  type LeadStage,
  type RevenueState,
} from '../types/growthInbox.js';

export const GROWTH_OPPORTUNITY_INTELLIGENCE_CONTRACT =
  'fcr/growth-opportunity-intelligence@v1' as const;

export type OpportunitySignal =
  | 'expressed_need'
  | 'fit_question'
  | 'price_interest'
  | 'availability_interest'
  | 'timing_interest'
  | 'reply'
  | 'return_visit'
  | 'booking_action'
  | 'purchase_action'
  | 'referral'
  | 'known_project_relationship'
  | 'verified_conversion';

export type OpportunityEvidenceState =
  | 'verified'
  | 'unknown'
  | 'conflicting'
  | 'expired';

export interface OpportunityEvidence {
  reference: string;
  signal: OpportunitySignal;
  state: OpportunityEvidenceState;
  source: string;
  observedAt: string;
}

export interface OpportunityLearningOutcome {
  state: 'verified_success' | 'verified_miss' | 'unknown';
  northStarMet: boolean | null;
  evidenceReferences: string[];
}

export interface GrowthOpportunityInput {
  lead: LeadRecord;
  projectNorthStar: string;
  evaluatedAt: string;
  evidence: OpportunityEvidence[];
  offerId?: string;
  predecessorFingerprint?: string;
  learningOutcome?: OpportunityLearningOutcome;
}

export type OpportunityPriorityBand =
  | 'blocked'
  | 'unknown'
  | 'cool'
  | 'warm'
  | 'hot'
  | 'won';

export type OpportunityLearningDisposition =
  | 'promote_candidate'
  | 'revision_memory'
  | 'hold_unknown';

export interface GrowthOpportunityAssessment {
  contract: typeof GROWTH_OPPORTUNITY_INTELLIGENCE_CONTRACT;
  projectId: string;
  contactId: string | null;
  offerId: string | null;
  score: number;
  priorityBand: OpportunityPriorityBand;
  recommendedStage: LeadStage;
  reasons: string[];
  unknowns: string[];
  nextGate: string;
  personalizationContext: {
    expressedNeed: string | null;
    productOrOffer: string | null;
    sourceCampaign: string | null;
    verifiedSignals: OpportunitySignal[];
    evidenceReferences: string[];
  };
  learning: {
    disposition: OpportunityLearningDisposition;
    evidenceReferences: string[];
    reason: string;
  };
  continuity: {
    fingerprint: string;
    predecessorFingerprint: string | null;
    evidenceDigest: string;
    evaluatedAt: string;
  };
  authority: {
    advisoryOnly: true;
    authorizesOutreach: false;
    authorizesPricing: false;
    authorizesLeadMutation: false;
    authorizesProviderMutation: false;
    authorizesSpend: false;
  };
}

const SIGNALS = new Set<OpportunitySignal>([
  'expressed_need',
  'fit_question',
  'price_interest',
  'availability_interest',
  'timing_interest',
  'reply',
  'return_visit',
  'booking_action',
  'purchase_action',
  'referral',
  'known_project_relationship',
  'verified_conversion',
]);

const EVIDENCE_STATES = new Set<OpportunityEvidenceState>([
  'verified',
  'unknown',
  'conflicting',
  'expired',
]);

const LEAD_STAGES = new Set<LeadStage>([
  'new',
  'engaged',
  'qualified',
  'nurture',
  'high_intent',
  'booked',
  'won',
  'lost',
  'do_not_contact',
]);

const REVENUE_STATES = new Set<RevenueState>([
  'attention',
  'permission',
  'conversation',
  'qualified',
  'booked',
  'invoiced',
  'pledged',
  'payment_collected',
  'refunded',
  'charged_back',
  'retained',
  'referred',
]);

const SIGNAL_WEIGHTS: Readonly<Record<OpportunitySignal, number>> = Object.freeze({
  expressed_need: 20,
  fit_question: 15,
  price_interest: 15,
  availability_interest: 10,
  timing_interest: 10,
  reply: 5,
  return_visit: 5,
  booking_action: 25,
  purchase_action: 25,
  referral: 10,
  known_project_relationship: 10,
  verified_conversion: 30,
});

const SHA256 = /^[0-9a-f]{64}$/i;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#?=&-]{2,255}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function assertExactTimestamp(label: string, value: unknown): string {
  const raw = text(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== raw) {
    throw new Error(`${label} must be an exact ISO-8601 timestamp`);
  }
  return raw;
}

function assertReference(label: string, value: unknown): string {
  const raw = text(value);
  if (!SAFE_REFERENCE.test(raw)) throw new Error(`${label} is missing or malformed`);
  return raw;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function validateLead(value: unknown): LeadRecord {
  const raw = record(value);
  if (!raw) throw new Error('lead is required');

  const projectId = text(raw.projectId);
  if (!projectId) throw new Error('lead.projectId is required');
  if (!LEAD_STAGES.has(raw.stage as LeadStage)) throw new Error('lead.stage is unsupported');
  if (!REVENUE_STATES.has(raw.revenueState as RevenueState)) {
    throw new Error('lead.revenueState is unsupported');
  }
  assertExactTimestamp('lead.lastStageChangeAt', raw.lastStageChangeAt);

  if (
    raw.actualCollectedValueCents !== undefined
    && (
      typeof raw.actualCollectedValueCents !== 'number'
      || !Number.isFinite(raw.actualCollectedValueCents)
      || raw.actualCollectedValueCents < 0
    )
  ) {
    throw new Error('lead.actualCollectedValueCents must be a non-negative finite number when provided');
  }

  if (!Array.isArray(raw.qualificationEvidence)) {
    throw new Error('lead.qualificationEvidence must be an array');
  }

  return raw as unknown as LeadRecord;
}

function recommendedStage(
  lead: LeadRecord,
  verifiedSignals: ReadonlySet<OpportunitySignal>,
): LeadStage {
  if (lead.stage === 'do_not_contact') return 'do_not_contact';
  if (isCollectedRevenue(lead)) return 'won';
  if (verifiedSignals.has('booking_action')) return 'booked';
  if (
    verifiedSignals.has('purchase_action')
    || verifiedSignals.has('price_interest')
    || verifiedSignals.has('availability_interest')
    || verifiedSignals.has('timing_interest')
  ) return 'high_intent';
  if (
    verifiedSignals.has('expressed_need')
    && (
      verifiedSignals.has('fit_question')
      || verifiedSignals.has('known_project_relationship')
    )
  ) return 'qualified';
  if (
    verifiedSignals.has('reply')
    || verifiedSignals.has('return_visit')
    || verifiedSignals.has('referral')
    || verifiedSignals.has('expressed_need')
    || verifiedSignals.has('fit_question')
  ) return 'engaged';
  return lead.stage === 'lost' ? 'lost' : 'new';
}

function nextGateFor(stage: LeadStage, band: OpportunityPriorityBand): string {
  if (stage === 'do_not_contact') return 'respect_suppression';
  if (stage === 'won') return 'deliver_and_verify_customer_value';
  if (stage === 'booked') return 'verify_booking_then_prepare_delivery';
  if (stage === 'high_intent') return 'founder_review_offer_fit_and_next_action';
  if (stage === 'qualified') return 'prepare_evidence_bound_founder_draft';
  if (stage === 'engaged') return 'verify_problem_offer_fit';
  if (stage === 'lost') return 'record_loss_reason_and_stop';
  return band === 'unknown' ? 'collect_qualification_evidence' : 'observe_for_explicit_intent';
}

function learningDisposition(value: unknown): GrowthOpportunityAssessment['learning'] {
  if (value === undefined || value === null) {
    return {
      disposition: 'hold_unknown',
      evidenceReferences: [],
      reason: 'No verified North Star outcome is bound to this opportunity assessment.',
    };
  }

  const learning = record(value);
  if (!learning) throw new Error('learningOutcome must be an object when provided');
  const state = learning.state;
  if (state !== 'verified_success' && state !== 'verified_miss' && state !== 'unknown') {
    throw new Error('learningOutcome.state is unsupported');
  }
  if (
    learning.northStarMet !== true
    && learning.northStarMet !== false
    && learning.northStarMet !== null
  ) {
    throw new Error('learningOutcome.northStarMet must be true, false, or null');
  }
  if (!Array.isArray(learning.evidenceReferences)) {
    throw new Error('learningOutcome.evidenceReferences must be an array');
  }

  const refs = uniqueSorted(learning.evidenceReferences.map((reference, index) =>
    assertReference(`learningOutcome.evidenceReferences[${index}]`, reference)));

  if (state === 'unknown') {
    return {
      disposition: 'hold_unknown',
      evidenceReferences: refs,
      reason: 'Outcome evidence is still unknown; no prompt or sequence promotion is allowed.',
    };
  }

  if (refs.length === 0) {
    throw new Error('verified learning outcomes require at least one evidence reference');
  }

  if (state === 'verified_success' && learning.northStarMet === true) {
    return {
      disposition: 'promote_candidate',
      evidenceReferences: refs,
      reason: 'Verified evidence says the lane North Star was met; the prompt or sequence may be considered for promotion.',
    };
  }

  if (state === 'verified_miss' && learning.northStarMet === false) {
    return {
      disposition: 'revision_memory',
      evidenceReferences: refs,
      reason: 'Verified evidence says the intended North Star was missed; retain the pattern for revision rather than promotion.',
    };
  }

  return {
    disposition: 'hold_unknown',
    evidenceReferences: refs,
    reason: 'Learning state and North Star result disagree, so no success or failure promotion is allowed.',
  };
}

export function evaluateGrowthOpportunity(
  input: GrowthOpportunityInput,
): GrowthOpportunityAssessment {
  const rawInput = record(input);
  if (!rawInput) throw new Error('opportunity input is required');
  const lead = validateLead(rawInput.lead);
  const projectId = text(lead.projectId);
  const northStar = text(rawInput.projectNorthStar);
  if (!northStar) throw new Error('projectNorthStar is required');
  const evaluatedAt = assertExactTimestamp('evaluatedAt', rawInput.evaluatedAt);
  const evaluatedMs = Date.parse(evaluatedAt);

  const rawEvidence = rawInput.evidence;
  if (!Array.isArray(rawEvidence)) throw new Error('evidence must be an array');
  const seenReferences = new Set<string>();
  const normalizedEvidence = rawEvidence.map((value, index) => {
    const item = record(value);
    if (!item) throw new Error(`evidence[${index}] must be an object`);
    const reference = assertReference(`evidence[${index}].reference`, item.reference);
    if (seenReferences.has(reference)) throw new Error(`duplicate evidence reference: ${reference}`);
    seenReferences.add(reference);

    const signal = item.signal as OpportunitySignal;
    const state = item.state as OpportunityEvidenceState;
    if (!SIGNALS.has(signal)) throw new Error(`evidence[${index}].signal is unsupported`);
    if (!EVIDENCE_STATES.has(state)) throw new Error(`evidence[${index}].state is unsupported`);
    const source = text(item.source);
    if (!source) throw new Error(`evidence[${index}].source is required`);
    const observedAt = assertExactTimestamp(`evidence[${index}].observedAt`, item.observedAt);
    if (Date.parse(observedAt) > evaluatedMs) throw new Error(`evidence[${index}] cannot be future-dated`);

    return { reference, signal, state, source, observedAt };
  });

  const verified = normalizedEvidence.filter((item) => item.state === 'verified');
  const verifiedSignals = new Set<OpportunitySignal>(verified.map((item) => item.signal));
  const score = Math.min(
    100,
    [...verifiedSignals].reduce((sum, signal) => sum + SIGNAL_WEIGHTS[signal], 0),
  );
  const stage = recommendedStage(lead, verifiedSignals);

  let priorityBand: OpportunityPriorityBand;
  if (stage === 'do_not_contact') priorityBand = 'blocked';
  else if (isCollectedRevenue(lead)) priorityBand = 'won';
  else if (verifiedSignals.size === 0) priorityBand = 'unknown';
  else if (score >= 50) priorityBand = 'hot';
  else if (score >= 25) priorityBand = 'warm';
  else priorityBand = 'cool';

  const reasons = uniqueSorted(verified.map((item) => `${item.signal}:${item.reference}`));
  const unknowns = uniqueSorted(normalizedEvidence
    .filter((item) => item.state !== 'verified')
    .map((item) => `${item.state}:${item.signal}:${item.reference}`));

  const evidenceDigest = sha256(JSON.stringify(normalizedEvidence
    .map((item) => ({
      reference: item.reference,
      signal: item.signal,
      state: item.state,
      source: item.source,
      observedAt: item.observedAt,
    }))
    .sort((a, b) => a.reference.localeCompare(b.reference))));

  const offerIdRaw = text(rawInput.offerId);
  if (offerIdRaw && !SAFE_ID.test(offerIdRaw)) throw new Error('offerId is malformed');
  const offerId = offerIdRaw || null;
  const predecessorFingerprint = text(rawInput.predecessorFingerprint) || null;
  if (predecessorFingerprint && !SHA256.test(predecessorFingerprint)) {
    throw new Error('predecessorFingerprint must be sha256 when provided');
  }

  const fingerprint = sha256(JSON.stringify({
    contract: GROWTH_OPPORTUNITY_INTELLIGENCE_CONTRACT,
    projectId,
    contactId: text(lead.contactId) || null,
    stage: lead.stage,
    revenueState: lead.revenueState,
    actualCollectedValueCents: lead.actualCollectedValueCents ?? null,
    expressedNeed: text(lead.expressedNeed) || null,
    productOrOffer: text(lead.productOrOffer) || null,
    sourceCampaign: text(lead.sourceCampaign) || null,
    offerId,
    projectNorthStar: northStar,
    evidenceDigest,
  }));

  const learning = learningDisposition(rawInput.learningOutcome);

  return {
    contract: GROWTH_OPPORTUNITY_INTELLIGENCE_CONTRACT,
    projectId,
    contactId: text(lead.contactId) || null,
    offerId,
    score,
    priorityBand,
    recommendedStage: stage,
    reasons,
    unknowns,
    nextGate: nextGateFor(stage, priorityBand),
    personalizationContext: {
      expressedNeed: text(lead.expressedNeed) || null,
      productOrOffer: text(lead.productOrOffer) || null,
      sourceCampaign: text(lead.sourceCampaign) || null,
      verifiedSignals: [...verifiedSignals].sort((a, b) => a.localeCompare(b)),
      evidenceReferences: uniqueSorted(verified.map((item) => item.reference)),
    },
    learning,
    continuity: {
      fingerprint,
      predecessorFingerprint,
      evidenceDigest,
      evaluatedAt,
    },
    authority: {
      advisoryOnly: true,
      authorizesOutreach: false,
      authorizesPricing: false,
      authorizesLeadMutation: false,
      authorizesProviderMutation: false,
      authorizesSpend: false,
    },
  };
}
