export type RiskState = 'green' | 'yellow' | 'red';

export type MissionLane = 'founder-os' | 'sekret-bip' | 'partner-project';

export interface EvidenceArtifact {
  id: string;
  label: string;
  kind: 'log' | 'screenshot' | 'trace' | 'metric' | 'note';
  verified: boolean;
}

export interface MissionCard {
  id: string;
  title: string;
  lane: MissionLane;
  objective: string;
  risk: RiskState;
  observe: string[];
  orient: string[];
  decide: string[];
  act: string[];
  evidence: EvidenceArtifact[];
  nextAction: string;
}

export interface LaneSummary {
  id: MissionLane;
  label: string;
  description: string;
  status: string;
  risk: RiskState;
  metrics: Array<{ label: string; value: string }>;
}
