export type ExternalUseSource = "github_mcp" | "exa_mcp" | "manual";

export type ExternalUseClassification =
  | "confirmed"
  | "probable"
  | "possible"
  | "dismissed";

export interface ExternalUseProject {
  slug: string;
  name: string;
  repository: string;
}

export interface ExternalUseCandidate {
  source: ExternalUseSource;
  sourceTool: string;
  evidenceUrl: string;
  externalOwner?: string;
  externalRepository?: string;
  title: string;
  evidenceSummary: string;
  discoveryQuery: string;
  observedAt: string;
}

export interface ExternalUseFiveWOneH {
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  how: string;
}

export interface NormalizedExternalUse extends ExternalUseCandidate {
  evidenceHash: string;
  classification: ExternalUseClassification;
  confidence: number;
  fiveWOneH: ExternalUseFiveWOneH;
}

export interface ExternalUseDiscoverySummary {
  scannedProjects: number;
  discoveredCandidates: number;
  inserted: number;
  refreshed: number;
  sourceCounts: Record<string, number>;
  warnings: string[];
}

export interface ExternalUseDigestItem {
  projectName: string;
  projectRepository: string;
  title: string;
  evidenceUrl: string;
  evidenceSummary: string;
  classification: ExternalUseClassification;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  fiveWOneH: ExternalUseFiveWOneH;
}
