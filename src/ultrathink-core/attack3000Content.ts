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

export interface ContentPublicationObservation {
  published: boolean;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface ContentMetricObservation {
  count: number | null;
  classification: Attack3000Reality;
  evidenceRefs: readonly string[];
}

export interface ContentTermsInput {
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
  published: boolean;
  engagementRatePct: number | null;
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

function hasEvidence(refs: readonly string[]): boolean {
  return cleanRefs(refs).length > 0;
}

function validCount(count: number | null): count is number {
  return count !== null && Number.isSafeInteger(count) && count >= 0;
}

function publicationReality(
  observation: ContentPublicationObservation,
  reasons: Set<string>,
): Attack3000Reality {
  let classification = observation.classification;
  if (observation.classification === 'VERIFIED' && !hasEvidence(observation.evidenceRefs)) {
    reasons.add('publication:verified_without_evidence');
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (observation.classification !== 'VERIFIED') {
    reasons.add(`publication:${observation.classification.toLowerCase()}`);
  }
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
  reasons: Set<string>,
): Attack3000Reality {
  let classification = observation.classification;
  if (!validCount(observation.count)) {
    reasons.add(`${label}:invalid_count`);
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (observation.classification === 'VERIFIED' && !hasEvidence(observation.evidenceRefs)) {
    reasons.add(`${label}:verified_without_evidence`);
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (observation.classification !== 'VERIFIED') {
    reasons.add(`${label}:${observation.classification.toLowerCase()}`);
  }
  return classification;
}

/**
 * Founder content already has an outcome observation contract. This adapter
 * translates those observed counters into third-order decision evidence rather
 * than inventing a second analytics vocabulary. Publishing and impressions are
 * distribution facts, not proof of demand or business outcome by themselves.
 */
export function deriveContentTerms(input: ContentTermsInput): ContentTermsDerivation {
  const reasons = new Set<string>();
  const realities = [
    publicationReality(input.publication, reasons),
    metricReality('impressions', input.impressions, reasons),
    metricReality('reactions', input.reactions, reasons),
    metricReality('comments', input.comments, reasons),
    metricReality('profile_views', input.profileViews, reasons),
    metricReality('attributed_visits', input.attributedVisits, reasons),
    metricReality('qualified_conversations', input.qualifiedConversations, reasons),
    metricReality('attributed_contacts', input.attributedContacts, reasons),
    metricReality('attributed_deals', input.attributedDeals, reasons),
  ];

  const evidenceRefs = cleanRefs([
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
  const visits = validCount(input.attributedVisits.count) ? input.attributedVisits.count : null;
  const conversations = validCount(input.qualifiedConversations.count)
    ? input.qualifiedConversations.count
    : null;
  const contacts = validCount(input.attributedContacts.count) ? input.attributedContacts.count : null;
  const deals = validCount(input.attributedDeals.count) ? input.attributedDeals.count : null;

  if (impressions === 0) reasons.add('distribution:zero_impressions');
  if (visits === 0) reasons.add('intent:zero_attributed_visits');
  if (contacts === 0) reasons.add('conversion:zero_attributed_contacts');

  return {
    classification: weakestReality(...realities),
    published: input.publication.published,
    engagementRatePct:
      impressions !== null && impressions > 0 && reactions !== null && comments !== null
        ? ((reactions + comments) / impressions) * 100
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
  if (!Number.isFinite(floor.minRatePct) || floor.minRatePct < 0) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  if (floor.classification === 'VERIFIED' && !hasEvidence(floor.evidenceRefs)) {
    classification = weakestReality(classification, 'UNKNOWN');
  }
  return classification;
}

function buildCountFloorStopCondition(
  terms: ContentTermsDerivation,
  metricName: 'impressions' | 'qualified conversations' | 'attributed deals',
  metric: number | null,
  floor: ContentCountFloor,
): Attack3000Trigger {
  const floorValid = Number.isSafeInteger(floor.minCount) && floor.minCount >= 0;
  return {
    statement: `Stop if ${metricName} fall below the founder-defined floor of ${floor.minCount}.`,
    classification: weakestReality(terms.classification, normalizeCountFloor(floor)),
    triggered: floorValid && metric !== null && metric < floor.minCount,
    evidenceRefs: cleanRefs([...terms.evidenceRefs, ...floor.evidenceRefs]),
  };
}

function buildRateFloorStopCondition(
  terms: ContentTermsDerivation,
  metric: number | null,
  floor: ContentRateFloor,
): Attack3000Trigger {
  const floorValid = Number.isFinite(floor.minRatePct) && floor.minRatePct >= 0;
  return {
    statement: `Stop if engagement rate falls below the founder-defined floor of ${floor.minRatePct}%.`,
    classification: weakestReality(terms.classification, normalizeRateFloor(floor)),
    triggered: floorValid && metric !== null && metric < floor.minRatePct,
    evidenceRefs: cleanRefs([...terms.evidenceRefs, ...floor.evidenceRefs]),
  };
}

function externalDemandEvidence(
  evidence: Attack3000Evidence,
  terms: ContentTermsDerivation,
  impressions: number | null,
): Attack3000Evidence {
  const observedDistribution = terms.published && impressions !== null && impressions > 0;
  return {
    ...evidence,
    classification: weakestReality(evidence.classification, terms.classification),
    direction: observedDistribution ? evidence.direction : 'NEUTRAL',
    evidenceRefs: cleanRefs([...evidence.evidenceRefs, ...terms.evidenceRefs]),
    note: [
      evidence.note?.trim(),
      `published=${terms.published}; engagementRatePct=${terms.engagementRatePct ?? 'unknown'}; visitRatePct=${terms.visitRatePct ?? 'unknown'}; qualifiedConversationRatePct=${terms.qualifiedConversationRatePct ?? 'unknown'}; dealConversionPct=${terms.dealConversionPct ?? 'unknown'}; termClassification=${terms.classification}`,
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
      terms,
      'impressions',
      validCount(input.terms.impressions.count) ? input.terms.impressions.count : null,
      input.stopCondition.floor,
    );
  } else if (input.stopCondition.kind === 'minimum_engagement_rate') {
    stopCondition = buildRateFloorStopCondition(
      terms,
      terms.engagementRatePct,
      input.stopCondition.floor,
    );
  } else if (input.stopCondition.kind === 'minimum_qualified_conversations') {
    stopCondition = buildCountFloorStopCondition(
      terms,
      'qualified conversations',
      validCount(input.terms.qualifiedConversations.count)
        ? input.terms.qualifiedConversations.count
        : null,
      input.stopCondition.floor,
    );
  } else {
    stopCondition = buildCountFloorStopCondition(
      terms,
      'attributed deals',
      validCount(input.terms.attributedDeals.count) ? input.terms.attributedDeals.count : null,
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
        external_demand: externalDemandEvidence(
          input.evidence.externalDemand,
          terms,
          validCount(input.terms.impressions.count) ? input.terms.impressions.count : null,
        ),
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
