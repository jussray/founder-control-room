import type { Sha256 } from './witness-policy.v0.js';

export type WitnessStateV0 = 'PASS' | 'FAIL' | 'MISSING' | 'STALE' | 'UNRESOLVABLE';

export type WitnessObserverV0 = {
  adapter: string;
  version: string;
  provider?: 'github' | 'cloudflare' | 'supabase' | 'playwright' | 'n8n' | 'other';
};

export type WitnessResultV0 = {
  kind: 'witness-result.v0';
  version: 0;
  repo: string;
  branch: 'main';
  witnessId: string;
  state: WitnessStateV0;
  evaluatedSha?: string;
  policyHash?: Sha256;
  scenarioFingerprint?: Sha256;
  evidenceRef?: string;
  evidenceHash?: Sha256;
  observedAt?: string;
  expiresAt?: string;
  correlationId: string;
  observer: WitnessObserverV0;
  reasonCode?: string;
  summary?: string;
};
