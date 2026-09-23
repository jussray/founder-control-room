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

export type EvidenceClassification =
  | 'VERIFIED_DECISION'
  | 'VERIFIED_COMMITMENT'
  | 'VERIFIED_EVIDENCE'
  | 'INFERRED'
  | 'UNKNOWN'
  | 'BLOCKED'
  | 'STALE_SUPERSEDED';

export type EvidenceFreshness =
  | 'CURRENT'
  | 'HISTORICAL'
  | 'STALE'
  | 'SUPERSEDED';

export interface InitiativeEvidenceReceipt {
  id: string;
  classification: EvidenceClassification;
  freshness: EvidenceFreshness;
  sourceKind:
    | 'plan'
    | 'city_email'
    | 'program_guideline'
    | 'application'
    | 'partner_email'
    | 'repository_doc';
  observedAt: string;
  validThrough: string;
  sourceRef: string;
  sourceVersion: string;
  summary: string;
  authorityEffect: 'none';
}

export type InitiativeGateStatus = 'VERIFIED' | 'PARTIAL' | 'OPEN' | 'BLOCKED' | 'UNKNOWN';

export interface InitiativeGate {
  id: string;
  status: InitiativeGateStatus;
  summary: string;
  receiptIds: string[];
  proofToClear: string;
  blockers: string[];
}

export interface InitiativeExecutionSnapshot {
  contractVersion: string;
  initiativeId: string;
  initiativeName: string;
  jurisdictionId: string;
  goal: string;
  evidenceObservedThrough: string;
  receipts: InitiativeEvidenceReceipt[];
  gates: InitiativeGate[];
  nextGateId: string;
  continuityFingerprint: string;
  authority: {
    kind: 'descriptive_only';
    canAuthorize: false;
    note: string;
  };
}
