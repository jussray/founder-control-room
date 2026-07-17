export type JurisdictionType =
  | 'city'
  | 'county'
  | 'region'
  | 'state'
  | 'tribal'
  | 'other';

export interface Jurisdiction {
  id: string;
  slug: string;
  name: string;
  type: JurisdictionType;
  countryCode: string;
  timezone: string;
  parentJurisdictionId?: string;
  dataClassification: 'verified_public' | 'synthetic_verification_fixture';
}

export interface OpportunitySignals {
  impact: number;
  feasibility: number;
  evidence: number;
  urgency: number;
  equity: number;
}

export interface OpportunityInput {
  id: string;
  jurisdictionId: string;
  title: string;
  category: string;
  sourceIds: string[];
  signals: OpportunitySignals;
}

export interface ScoredOpportunity extends OpportunityInput {
  score: number;
  scoreBand: 'priority' | 'promising' | 'monitor' | 'insufficient_evidence';
  scoreVersion: string;
}

export interface EconomicIntelligenceDemo {
  contractVersion: string;
  jurisdiction: Jurisdiction;
  opportunities: ScoredOpportunity[];
  dataClassification: Jurisdiction['dataClassification'];
}
