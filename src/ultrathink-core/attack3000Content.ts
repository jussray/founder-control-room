import {
  ATTACK_3000_SCHEMA,
  evaluateAttack3000,
  type Attack3000Assessment,
  type Attack3000Evaluation,
  type Attack3000Evidence,
  type Attack3000Reality,
  type Attack3000Subject,
  type Attack3000Trigger,
} from './attack3000.js';

export const ATTACK_3000_CONTENT_ADAPTER_ID = 'content-outcome-learning@v1' as const;

export type ContentObservationFreshness =
  | 'CURRENT'
  | 'HISTORICAL'
  | 'STALE'
  | 'SUPERSEDED'
  | 'INVALIDATED'
  | 'UNKNOWN';

export interface ContentObservationContext {
  observationId: string;
  contentFingerprint: string;
  provider: string;
  windowStart: string;
  windowEnd: string;
  observedAt: string;
  measurementComplete: boolean;
  freshness: ContentObservationFreshness;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface ContentPublicationObservation {
  observationId: string;
  published: boolean;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface ContentMetricObservation {
  observationId: string;
  count: number | null;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface ContentTermsInput {
  observation: ContentObservationContext;
  publication: ContentPublicationObservation;
  impressions: ContentMetricObservation;
  reactions: ContentMetricObservation;
  comments: ContentMetricObservation;
  profileViews: ContentMetricObservation;
  attributedVisits: ContentMetricObservation;
  qualifiedConversations: ContentMetricObservation;
  attributedContacts: ContentMetricObservation;
  attributedDeals: ContentMetricObservation;
}

export interface ContentTermsDerivation {
  classification: Attack3000Reality;
  observation: Readonly<ContentObservationContext>;
  published: boolean;
  engagementRatePct: number | null;
  profileViewRatePct: number | null;
  visitRatePct: number | null;
  qualifiedConversationRatePct: number | null;
  dealConversionPct: number | null;
  evidenceRefs: readonly string[];
  reasons: readonly string[];
}

export interface ContentAttack3000Evidence {
  valueCreated: Attack3000Evidence;
  humanOutcome: Attack3000Evidence;
  externalDemand: Attack3000Evidence;
  economics: Attack3000Evidence;
  opportunityCost: Attack3000Evidence;
  dependencies: Attack3000Evidence;
  reversibility: Attack3000Evidence;
  secondOrderEffects: Attack3000Evidence;
  thirdOrderEffects: Attack3000Evidence;
}

export interface ContentCountFloor {
  minCount: number;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface ContentRateFloor {
  minRatePct: number;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export type ContentStopCondition =
  | { kind: 'explicit'; trigger: Attack3000Trigger }
  | { kind: 'minimum_impressions'; floor: ContentCountFloor }
  | { kind: 'minimum_engagement_rate'; floor: ContentRateFloor }
  | { kind: 'minimum_qualified_conversations'; floor: ContentCountFloor }
  | { kind: 'minimum_attributed_deals'; floor: ContentCountFloor };

export interface ContentAttack3000Input {
  subject: Omit<Attack3000Subject, 'domain'>;
  terms: ContentTermsInput;
  evidence: ContentAttack3000Evidence;
  falsifier: Attack3000Trigger;
  stopCondition: ContentStopCondition;
}

export interface ContentAttack3000Result {
  terms: ContentTermsDerivation;
  assessment: Attack3000Assessment;
  evaluation: Attack3000Evaluation;
}

const REALITY_RANK: Readonly<Record<Attack3000Reality, number>> = {
  VERIFIED: 0,
  INFERRED: 1,
  UNKNOWN: 2,
  BLOCKED: 3,
};

function weakestReality(...values: Attack3000Reality[]): Attack3000Reality {
  return values.reduce<Attack3000Reality>(
    (worst, current) => (REALITY_RANK[current] > REALITY_RANK[worst] ? current : worst),
    'VERIFIED',
  );
}

function cleanRefs(refs: readonly string[]): string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
}

function nonEmpty(value: string): boolean {
  return Boolean(value.trim());
}

function hasEvidence(refs: readonly string[]): boolean {
  return cleanRefs(refs).length > 0;
}

function validCount(count: number | null): count is number {
  return count !== null && Number.isSafeInteger(count) && count >= 0;
}

function validTime(value: string): number | null {
  if (!nonEmpty(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function observationContextReality(
  observation: ContentObservationContext,
  reasons: Set<string>,
): Attack3000Reality {
  let classification = observation.classification;

  if (!nonEmpty(observation.observationId)) {
    reasons.add('observation:missing_id');
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (!nonEmpty(observation.contentFingerprint)) {
    reasons.add('observation:missing_content_fingerprint');
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (!nonEmpty(observation.provider)) {
    reasons.add('observation:missing_provider');
    classification = weakestReality(classification, 'UNKNOWN');
  }

  const windowStart = validTime(observation.windowStart);
  const windowEnd = validTime(observation.windowEnd);
  const observedAt = validTime(observation.observedAt);
  if (windowStart === null || windowEnd === null || observedAt === null) {
    reasons.add('observation:invalid_time');
    classification = weakestReality(classification, 'UNKNOWN');
  } else {
    if (windowStart > windowEnd) {
      reasons.add('observation:window_reversed');
      classification = weakestReality(classification, 'UNKNOWN');
    }
    if (observedAt < windowEnd) {
      reasons.add('observation:observed_before_window_end');
      classification = weakestReality(classification, 'UNKNOWN');
    }
  }

  if (!observation.measurementComplete) {
    reasons.add('observation:measurement_incomplete');
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (observation.freshness !== 'CURRENT') {
    reasons.add(`observation:freshness_${observation.freshness.toLowerCase()}`);
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (observation.classification === 'VERIFIED' && !hasEvidence(observation.evidenceRefs)) {
    reasons.add('observation:verified_without_evidence');
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (observation.classification !== 'VERIFIED') {
    reasons.add(`observation:${observation.classification.toLowerCase()}`);
  }

  return classification;
}

function matchingObservationReality(
  label: string,
  observationId: string,
  expectedObservationId: string,
  classification: Attack3000Reality,
  evidenceRefs: readonly string[],
  reasons: Set<string>,
): Attack3000Reality {
  let reality = classification;
  if (!nonEmpty(observationId) || observationId !== expectedObservationId) {
    reasons.add(`${label}:observation_identity_mismatch`);
    reality = weakestReality(reality, 'UNKNOWN');
  }
  if (classification === 'VERIFIED' && !hasEvidence(evidenceRefs)) {
    reasons.add(`${label}:verified_without_evidence`);
    reality = weakestReality(reality, 'UNKNOWN');
  }
  if (classification !== 'VERIFIED') {
    reasons.add(`${label}:${classification.toLowerCase()}`);
  }
  return reality;
}

function publicationReality(
  observation: ContentPublicationObservation,
  expectedObservationId: string,
  reasons: Set<string>,
): Attack3000Reality {
  const classification = matchingObservationReality(
    'publication',
    observation.observationId,
    expectedObservationId,
    observation.classification,
    observation.evidenceRefs,
    reasons,
  );
  if (!observation.published) reasons.add('publication:not_published');
  return classification;
}

type ContentMetricLabel =
  | 'impressions'
  | 'reactions'
  | 'comments'
  | 'profile_views'
  | 'attributed_visits'
  | 'qualified_conversations'
  | 'attributed_contacts'
  | 'attributed_deals';

function metricReality(
  label: ContentMetricLabel,
  observation: ContentMetricObservation,
  expectedObservationId: string,
  reasons: Set<string>,
): Attack3000Reality {
  let classification = matchingObservationReality(
    label,
    observation.observationId,
    expectedObservationId,
    observation.classification,
    observation.evidenceRefs,
    reasons,
  );
  if (!validCount(observation.count)) {
    reasons.add(`${label}:invalid_count`);
    classification = weakestReality(classification, 'UNKNOWN');
  }
  return classification;
}

/**
 * Founder content already has an outcome observation contract. This adapter
 * translates one current, comparable observation window into third-order
 * decision evidence rather than inventing a second analytics vocabulary.
 * Publishing, reach, and engagement are not proof of demand or business
 * outcome by themselves.
 */
export function deriveContentTerms(input: ContentTermsInput): ContentTermsDerivation {
  const reasons = new Set<string>();
  const observationId = input.observation.observationId;
  const realities = [
    observationContextReality(input.observation, reasons),
    publicationReality(input.publication, observationId, reasons),
    metricReality('impressions', input.impressions, observationId, reasons),
    metricReality('reactions', input.reactions, observationId, reasons),
    metricReality('comments', input.comments, observationId, reasons),
    metricReality('profile_views', input.profileViews, observationId, reasons),
    metricReality('attributed_visits', input.attributedVisits, observationId, reasons),
    metricReality(
      'qualified_conversations',
      input.qualifiedConversations,
      observationId,
      reasons,
    ),
    metricReality('attributed_contacts', input.attributedContacts, observationId, reasons),
    metricReality('attributed_deals', input.attributedDeals, observationId, reasons),
  ];

  const evidenceRefs = cleanRefs([
    ...input.observation.evidenceRefs,
    ...input.publication.evidenceRefs,
    ...input.impressions.evidenceRefs,
    ...input.reactions.evidenceRefs,
    ...input.comments.evidenceRefs,
    ...input.profileViews.evidenceRefs,
    ...input.attributedVisits.evidenceRefs,
    ...input.qualifiedConversations.evidenceRefs,
    ...input.attributedContacts.evidenceRefs,
    ...input.attributedDeals.evidenceRefs,
  ]);

  const impressions = validCount(input.impressions.count) ? input.impressions.count : null;
  const reactions = validCount(input.reactions.count) ? input.reactions.count : null;
  const comments = validCount(input.comments.count) ? input.comments.count : null;
  const profileViews = validCount(input.profileViews.count) ? input.profileViews.count : null;
  const visits = validCount(input.attributedVisits.count) ? input.attributedVisits.count : null;
  const conversations = validCount(input.qualifiedConversations.count)
    ? input.qualifiedConversations.count
    : null;
  const contacts = validCount(input.attributedContacts.count) ? input.attributedContacts.count : null;
  const deals = validCount(input.attributedDeals.count) ? input.attributedDeals.count : null;

  if (impressions === 0) reasons.add('distribution:zero_impressions');
  if (profileViews === 0) reasons.add('intent:zero_profile_views');
  if (visits === 0) reasons.add('intent:zero_attributed_visits');
  if (contacts === 0) reasons.add('conversion:zero_attributed_contacts');

  return {
    classification: weakestReality(...realities),
    observation: {
      ...input.observation,
      evidenceRefs: cleanRefs(input.observation.evidenceRefs),
    },
    published: input.publication.published,
    engagementRatePct:
      impressions !== null && impressions > 0 && reactions !== null && comments !== null
        ? ((reactions + comments) / impressions) * 100
        : null,
    profileViewRatePct:
      impressions !== null && impressions > 0 && profileViews !== null
        ? (profileViews / impressions) * 100
        : null,
    visitRatePct:
      impressions !== null && impressions > 0 && visits !== null ? (visits / impressions) * 100 : null,
    qualifiedConversationRatePct:
      visits !== null && visits > 0 && conversations !== null ? (conversations / visits) * 100 : null,
    dealConversionPct:
      contacts !== null && contacts > 0 && deals !== null ? (deals / contacts) * 100 : null,
    evidenceRefs,
    reasons: [...reasons],
  };
}

function normalizeCountFloor(floor: ContentCountFloor): Attack3000Reality {
  let classification = floor.classification;
  if (!Number.isSafeInteger(floor.minCount) || floor.minCount < 0) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (floor.classification === 'VERIFIED' && !hasEvidence(floor.evidenceRefs)) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  return classification;
}

function normalizeRateFloor(floor: ContentRateFloor): Attack3000Reality {
  let classification = floor.classification;
  if (!Number.isFinite(floor.minRatePct) || floor.minRatePct < 0 || floor.minRatePct > 100) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (floor.classification === 'VERIFIED' && !hasEvidence(floor.evidenceRefs)) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  return classification;
}

type RelevantMetric = readonly [ContentMetricLabel, ContentMetricObservation];

function stopObservationReality(
  input: ContentTermsInput,
  metrics: readonly RelevantMetric[],
): Attack3000Reality {
  const reasons = new Set<string>();
  const observationId = input.observation.observationId;
  let classification = weakestReality(
    observationContextReality(input.observation, reasons),
    publicationReality(input.publication, observationId, reasons),
    ...metrics.map(([label, metric]) => metricReality(label, metric, observationId, reasons)),
  );

  if (!input.publication.published) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  return classification;
}

function stopEvidenceRefs(
  input: ContentTermsInput,
  metrics: readonly RelevantMetric[],
  floorRefs: readonly string[],
): string[] {
  return cleanRefs([
    ...input.observation.evidenceRefs,
    ...input.publication.evidenceRefs,
    ...metrics.flatMap(([, metric]) => metric.evidenceRefs),
    ...floorRefs,
  ]);
}

function buildCountFloorStopCondition(
  input: ContentTermsInput,
  metricName: 'impressions' | 'qualified conversations' | 'attributed deals',
  label: ContentMetricLabel,
  metricObservation: ContentMetricObservation,
  floor: ContentCountFloor,
): Attack3000Trigger {
  const floorValid = Number.isSafeInteger(floor.minCount) && floor.minCount >= 0;
  const metric = validCount(metricObservation.count) ? metricObservation.count : null;
  const relevantMetrics: readonly RelevantMetric[] = [[label, metricObservation]];
  const classification = weakestReality(
    stopObservationReality(input, relevantMetrics),
    normalizeCountFloor(floor),
  );
  return {
    statement: `Stop if ${metricName} fall below the founder-defined floor of ${floor.minCount}.`,
    classification,
    triggered:
      classification === 'VERIFIED' && floorValid && metric !== null && metric < floor.minCount,
    evidenceRefs: stopEvidenceRefs(input, relevantMetrics, floor.evidenceRefs),
  };
}

function buildRateFloorStopCondition(
  input: ContentTermsInput,
  metric: number | null,
  relevantMetrics: readonly RelevantMetric[],
  floor: ContentRateFloor,
): Attack3000Trigger {
  const floorValid =
    Number.isFinite(floor.minRatePct) && floor.minRatePct >= 0 && floor.minRatePct <= 100;
  let classification = weakestReality(
    stopObservationReality(input, relevantMetrics),
    normalizeRateFloor(floor),
  );
  if (metric === null) classification = weakestReality(classification, 'UNKNOWN');
  return {
    statement: `Stop if engagement rate falls below the founder-defined floor of ${floor.minRatePct}%.`,
    classification,
    triggered:
      classification === 'VERIFIED' && floorValid && metric !== null && metric < floor.minRatePct,
    evidenceRefs: stopEvidenceRefs(input, relevantMetrics, floor.evidenceRefs),
  };
}

function positiveObservedMetric(observation: ContentMetricObservation): boolean {
  return validCount(observation.count) && observation.count > 0;
}

function externalDemandEvidence(
  evidence: Attack3000Evidence,
  terms: ContentTermsDerivation,
  input: ContentTermsInput,
): Attack3000Evidence {
  const impressions = validCount(input.impressions.count) ? input.impressions.count : null;
  const observedDemandSignal =
    terms.published &&
    terms.observation.freshness === 'CURRENT' &&
    terms.observation.measurementComplete &&
    impressions !== null &&
    impressions > 0 &&
    [
      input.attributedVisits,
      input.qualifiedConversations,
      input.attributedContacts,
      input.attributedDeals,
    ].some(positiveObservedMetric);
  const directDemandRefs = cleanRefs(evidence.evidenceRefs);
  const directDemandClassification =
    evidence.classification === 'VERIFIED' && directDemandRefs.length === 0
      ? 'UNKNOWN'
      : evidence.classification;

  return {
    ...evidence,
    classification: weakestReality(directDemandClassification, terms.classification),
    direction: observedDemandSignal ? evidence.direction : 'NEUTRAL',
    evidenceRefs: directDemandRefs,
    note: [
      evidence.note?.trim(),
      `observationId=${terms.observation.observationId}; contentFingerprint=${terms.observation.contentFingerprint}; provider=${terms.observation.provider}; window=${terms.observation.windowStart}..${terms.observation.windowEnd}; observedAt=${terms.observation.observedAt}; freshness=${terms.observation.freshness}; published=${terms.published}; demandSignal=${observedDemandSignal}; engagementRatePct=${terms.engagementRatePct ?? 'unknown'}; profileViewRatePct=${terms.profileViewRatePct ?? 'unknown'}; visitRatePct=${terms.visitRatePct ?? 'unknown'}; qualifiedConversationRatePct=${terms.qualifiedConversationRatePct ?? 'unknown'}; dealConversionPct=${terms.dealConversionPct ?? 'unknown'}; termClassification=${terms.classification}`,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}

export function createContentAttack3000Assessment(
  input: ContentAttack3000Input,
): { terms: ContentTermsDerivation; assessment: Attack3000Assessment } {
  const terms = deriveContentTerms(input.terms);
  let stopCondition: Attack3000Trigger;

  if (input.stopCondition.kind === 'explicit') {
    stopCondition = input.stopCondition.trigger;
  } else if (input.stopCondition.kind === 'minimum_impressions') {
    stopCondition = buildCountFloorStopCondition(
      input.terms,
      'impressions',
      'impressions',
      input.terms.impressions,
      input.stopCondition.floor,
    );
  } else if (input.stopCondition.kind === 'minimum_engagement_rate') {
    stopCondition = buildRateFloorStopCondition(
      input.terms,
      terms.engagementRatePct,
      [
        ['impressions', input.terms.impressions],
        ['reactions', input.terms.reactions],
        ['comments', input.terms.comments],
      ],
      input.stopCondition.floor,
    );
  } else if (input.stopCondition.kind === 'minimum_qualified_conversations') {
    stopCondition = buildCountFloorStopCondition(
      input.terms,
      'qualified conversations',
      'qualified_conversations',
      input.terms.qualifiedConversations,
      input.stopCondition.floor,
    );
  } else {
    stopCondition = buildCountFloorStopCondition(
      input.terms,
      'attributed deals',
      'attributed_deals',
      input.terms.attributedDeals,
      input.stopCondition.floor,
    );
  }

  return {
    terms,
    assessment: {
      schema: ATTACK_3000_SCHEMA,
      subject: { ...input.subject, domain: 'content' },
      adapterId: ATTACK_3000_CONTENT_ADAPTER_ID,
      dimensions: {
        value_created: input.evidence.valueCreated,
        human_outcome: input.evidence.humanOutcome,
        external_demand: externalDemandEvidence(input.evidence.externalDemand, terms, input.terms),
        economics: input.evidence.economics,
        opportunity_cost: input.evidence.opportunityCost,
        dependencies: input.evidence.dependencies,
        reversibility: input.evidence.reversibility,
        second_order_effects: input.evidence.secondOrderEffects,
        third_order_effects: input.evidence.thirdOrderEffects,
      },
      falsifier: input.falsifier,
      stopCondition,
    },
  };
}

export function evaluateContentAttack3000(input: ContentAttack3000Input): ContentAttack3000Result {
  const { terms, assessment } = createContentAttack3000Assessment(input);
  return {
    terms,
    assessment,
    evaluation: evaluateAttack3000(assessment),
  };
}
