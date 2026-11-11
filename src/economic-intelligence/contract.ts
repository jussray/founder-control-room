import { scoreOpportunity, SCORE_VERSION, SCORE_WEIGHTS } from './score.js';
import type { EconomicIntelligenceDemo, Jurisdiction, OpportunityInput } from './types.js';

export const ECONOMIC_INTELLIGENCE_CONTRACT = Object.freeze({
  version: '1.1.0',
  cityAgnostic: true,
  scope: 'jurisdiction-configurable economic intelligence and evidence-bound initiative execution',
  primitives: [
    'jurisdiction',
    'organization',
    'source',
    'program',
    'opportunity',
    'signal',
    'outcome',
    'initiative',
    'gate',
    'evidence_receipt',
    'blocker',
  ],
  jurisdictionTypes: ['city', 'county', 'region', 'state', 'tribal', 'other'],
  scoreVersion: SCORE_VERSION,
  scoreWeights: SCORE_WEIGHTS,
  invariants: [
    'No database column, API field, score weight, or UI state may be named for a specific city.',
    'Jurisdiction identity is configuration and data, never application branching logic.',
    'Every factual claim requires source provenance and an observed-at timestamp.',
    'Synthetic verification fixtures must be visibly classified and may not be represented as public fact.',
    'Identical signals produce identical scores regardless of jurisdiction.',
    'Unknown jurisdictions and initiatives fail closed and never fall back to the first configured fixture.',
    'Operational data remains founder-protected; public contract surfaces expose no credentials or private product data.',
    'Evidence receipts, fingerprints, and proof cookies describe state continuity only and never create authority.',
    'A commitment, review promise, eligibility path, or financing fit must not be promoted into endorsement, approval, sponsorship, or outcome proof.',
    'Stale or superseded evidence cannot clear a current initiative gate without fresh authoritative observation.',
  ],
  prohibitedFields: [
    'johnstown_id',
    'city_specific_score',
    'default_city_data',
    'service_role_key',
    'teen_content',
  ],
});

const jurisdictions: Readonly<Record<string, Jurisdiction>> = Object.freeze({
  'johnstown-pa': {
    id: 'jurisdiction:us-pa-johnstown',
    slug: 'johnstown-pa',
    name: 'Johnstown',
    type: 'city',
    countryCode: 'US',
    timezone: 'America/New_York',
    dataClassification: 'verified_public',
  },
  'portability-test-city': {
    id: 'jurisdiction:synthetic-portability-test-city',
    slug: 'portability-test-city',
    name: 'Portability Test City',
    type: 'city',
    countryCode: 'US',
    timezone: 'America/Chicago',
    dataClassification: 'synthetic_verification_fixture',
  },
});

const opportunityTemplates: ReadonlyArray<Omit<OpportunityInput, 'id' | 'jurisdictionId'>> = Object.freeze([
  {
    title: 'Funding and eligibility routing',
    category: 'funding_access',
    sourceIds: ['source:program-inventory', 'source:resident-friction'],
    signals: { impact: 88, feasibility: 82, evidence: 84, urgency: 76, equity: 90 },
  },
  {
    title: 'Small-business opportunity and demand scan',
    category: 'market_intelligence',
    sourceIds: ['source:business-inventory', 'source:demand-signals'],
    signals: { impact: 79, feasibility: 73, evidence: 68, urgency: 71, equity: 66 },
  },
  {
    title: 'Public-investment outcome ledger',
    category: 'outcome_intelligence',
    sourceIds: ['source:investment-ledger', 'source:program-outcomes'],
    signals: { impact: 83, feasibility: 69, evidence: 75, urgency: 64, equity: 74 },
  },
]);

export function listJurisdictionSlugs(): string[] {
  return Object.keys(jurisdictions);
}

export function buildDemo(jurisdictionSlug: string): EconomicIntelligenceDemo | null {
  const jurisdiction = jurisdictions[jurisdictionSlug];
  if (!jurisdiction) return null;

  const opportunities = opportunityTemplates
    .map((template, index) => scoreOpportunity({
      ...template,
      id: `opportunity:${jurisdiction.slug}:${index + 1}`,
      jurisdictionId: jurisdiction.id,
    }))
    .sort((left, right) => right.score - left.score);

  return {
    contractVersion: ECONOMIC_INTELLIGENCE_CONTRACT.version,
    jurisdiction,
    opportunities,
    dataClassification: jurisdiction.dataClassification,
  };
}
