export const MIRROR_INTENT_TAGS = [
  'money',
  'people',
  'build',
  'health',
  'kids',
  'legal',
  'rest',
] as const;

export type MirrorIntentTag = (typeof MIRROR_INTENT_TAGS)[number];
export type MirrorMoveGoal = 'money' | 'people' | 'build';

export interface MirrorRunInput {
  transcript: string;
  relatedMemories: string[];
  timeEnergyContext: string;
  recipientContext: string | null;
  voiceProfile: string | null;
}

export interface MirrorModelOutput {
  headline: string;
  summary: string;
  intentTags: MirrorIntentTag[];
  actionText: string;
  script: string | null;
  timeEstimateMinutes: number;
  goal: MirrorMoveGoal;
  confidence: number;
  toneGuardedScript: string | null;
  containsExternalFactualClaims: boolean;
  factualClaims: string[];
}

export interface MirrorModelProvenance {
  provider: 'openai';
  model: string;
  responseId: string | null;
  promptVersion: string;
  storedByProvider: false;
}

export interface MirrorModelResult {
  output: MirrorModelOutput;
  provenance: MirrorModelProvenance;
}

export interface MirrorRunResponse extends MirrorModelOutput {
  version: 'mirror-engine-v1';
  runId: string;
  distribution: {
    mode: 'draft_only';
    factCheckStatus: 'not_required' | 'required_before_external_use';
    externalActionAllowed: false;
  };
  provenance: MirrorModelProvenance;
}