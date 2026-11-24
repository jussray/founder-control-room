import { mediaFingerprint } from './mediaRouter.js';

export const MAKEVIDEO_NERVOUS_SYSTEM_CONTRACT = 'founder-control-room/makevideo-nervous-system@v1' as const;

export type EvidenceClass = 'OBSERVED' | 'INFERRED' | 'UNKNOWN';
export type TemporalPath = 'CAUSAL_PATH' | 'ACCUMULATION_PATH';
export type AwarenessLevel = 'PRIMARY_FOCUS' | 'SECONDARY_AWARENESS' | 'AMBIENT_AWARENESS' | 'SUPPRESSED';
export type ResponsePhase = 'ANTICIPATORY' | 'IMPACT' | 'CONFIRMATION' | 'SETTLE' | 'PERSISTENT';
export type SubsystemType = 'PLAYER' | 'OBJECT' | 'ENVIRONMENT' | 'CAMERA' | 'AUDIO' | 'UI' | 'TEXT';
export type ResponseChannel = SubsystemType | 'MOTION' | 'SILENCE' | 'SPATIAL';
export type DevilVerdict = 'proceed' | 'revise' | 'test' | 'defer' | 'reject';

export interface LeevizeVisualCanon {
  worldId: string;
  artStyle: string;
  colorPalette: readonly string[];
  lightingProfile: {
    keyLightAngle: number;
    shadowDensity: number;
    colorTemperatureK: number;
  };
  shotLanguagePreferences: {
    preferredFocalLengths: readonly number[];
    framingStances: readonly ('WIDE' | 'MEDIUM' | 'CLOSE_UP' | 'MACRO')[];
    compositionRules: readonly string[];
  };
  characterCanons: readonly {
    characterId: string;
    identityFingerprint: string;
    wardrobeState: string;
  }[];
}

export interface CausalMutation {
  subsystem: SubsystemType;
  before: unknown;
  after: unknown;
  confidence: EvidenceClass;
  evidenceRefs: readonly string[];
}

export interface CausalResponse {
  channel: ResponseChannel;
  responseDescription: string;
  phase: ResponsePhase;
  role: string;
  evidenceRefs: readonly string[];
}

export interface CausalEvent {
  id: string;
  observedCause: string;
  inferredIntent?: string;
  onsetTimestamp: number;
  mutations: readonly CausalMutation[];
  responses: readonly CausalResponse[];
  evidenceRefs: readonly string[];
}

export interface LatentState {
  id: string;
  subjectOrRelationship: string;
  observedSignals: readonly string[];
  inferredCondition?: string;
  confidence: EvidenceClass;
  persistenceDuration: number;
  intensity: number;
  reinforcementEvents: readonly string[];
  contradictionEvents: readonly string[];
  lastObservedTimestamp: number;
  unresolved: boolean;
  evidenceRefs: readonly string[];
}

export interface AccumulatedMeaning {
  signalId: string;
  repetitionCount: number;
  invariantFeatures: readonly string[];
  changedFeatures: readonly string[];
  priorContext: unknown;
  currentContext: unknown;
  interpretationDelta: string;
  confidence: EvidenceClass;
  evidenceRefs: readonly string[];
}

export interface RelationalState {
  entities: readonly string[];
  distance: number;
  orientation: string;
  gazeRelation: 'INTERSECTING' | 'AVERTED' | 'FIXATED' | 'PARALLEL';
  motionRelation: 'APPROACHING' | 'RECEDING' | 'CROSSING' | 'STATIONARY';
  spatialConstraints: readonly string[];
  confidence: EvidenceClass;
  evidenceRefs: readonly string[];
}

export interface AttentionState {
  subjectOrEvent: string;
  awarenessLevel: AwarenessLevel;
  urgency: number;
  relevance: number;
  spatialRelationship: string;
  focusInertiaCost: number;
  confidence: EvidenceClass;
  evidenceRefs: readonly string[];
}

export interface CognitiveLoadState {
  activeConcepts: readonly string[];
  readingLoad: number;
  listeningLoad: number;
  visualTrackingLoad: number;
  novelty: number;
  overloadRisk: boolean;
  releaseConditionMet: boolean;
}

export interface ViewerContract {
  explicitFocus: readonly string[];
  peripheralAwareness: readonly string[];
  atmosphericSignals: readonly string[];
  hiddenElements: readonly string[];
}

export interface LeevizeDirectives {
  lockCamera?: boolean;
  densityPreference?: 'RESTRAINED' | 'DENSE' | 'ADAPTIVE';
  requiredCompositionRules?: readonly string[];
}

export interface MakeVideoDevilReview {
  verdict: DevilVerdict;
  sourceRecordId: string;
  reviewedAt: string;
  rationale: string;
}

export interface DirectorConflict {
  conflictId: string;
  domain: 'AESTHETIC_VS_CAUSAL' | 'DENSITY_VS_RESTRAINT' | 'REPETITION_VS_STAGNATION' | 'FOCUS_SWITCH';
  leeVizeProposal: unknown;
  syncAvenueProposal: unknown;
  resolutionStrategy: 'OVERRIDE_LEEVIZE' | 'OVERRIDE_SYNC' | 'SYNTHESIZE' | 'HOLD_FOCUS';
  rationale: string;
}

export interface MakeVideoExecutionInput {
  founderIntent: string;
  viewerContract: ViewerContract;
  leeVizeCanon: LeevizeVisualCanon;
  leeVizeDirectives?: LeevizeDirectives;
  cognitiveLoad: CognitiveLoadState;
  currentAttention?: AttentionState;
  incomingAttention?: AttentionState;
  causalEvents?: readonly CausalEvent[];
  latentStates?: readonly LatentState[];
  accumulatedMeaning?: readonly AccumulatedMeaning[];
  relationalStates?: readonly RelationalState[];
  devilReview?: MakeVideoDevilReview;
}

export interface MakeVideoDirectorPlan {
  contract: typeof MAKEVIDEO_NERVOUS_SYSTEM_CONTRACT;
  founderIntent: string;
  viewerContract: ViewerContract;
  creativeLanes: {
    leevize: {
      role: 'art-direction-and-cinematic-construction';
      canonFingerprint: string;
    };
    syncAvenue: {
      role: 'temporal-direction-and-continuity-intelligence';
      stateFingerprint: string;
    };
  };
  temporalPaths: readonly TemporalPath[];
  attention: {
    decision: 'KEEP_CURRENT' | 'SWITCH_TO_INCOMING' | 'UNSPECIFIED';
    currentScore: number | null;
    incomingScore: number | null;
    switchThreshold: number | null;
  };
  directives: readonly string[];
  conflicts: readonly DirectorConflict[];
  evidenceSummary: Record<EvidenceClass, number>;
  continuity: {
    fingerprint: string;
    cookie: string;
  };
  governance: {
    devilReview: MakeVideoDevilReview | null;
    devilReviewPassesRoutingGate: boolean;
    executionAuthority: false;
  };
  providerRouting: {
    authority: 'media-router-only';
    permanentProviderAuthority: false;
    selectionMode: 'cheapest-qualified-live';
    requiredPreflight: readonly ['fingerprint-cookie', 'capability', 'availability', 'budget', 'devil'];
    preflightStatus: 'BLOCKED' | 'TEST_ONLY' | 'READY';
    publishAuthority: false;
  };
  postRenderGates: readonly ['motion-continuity-proof', 'assembly', 'release-authority'];
  fingerprint: string;
}

function unit(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
  return value;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative`);
  return value;
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function conflictId(conflict: Omit<DirectorConflict, 'conflictId'>): string {
  return `director_conflict_${mediaFingerprint(conflict).slice(0, 24)}`;
}

function makeConflict(conflict: Omit<DirectorConflict, 'conflictId'>): DirectorConflict {
  return { ...conflict, conflictId: conflictId(conflict) };
}

function attentionScore(state: AttentionState): number {
  return unit(state.urgency, 'attention urgency') * 0.6 + unit(state.relevance, 'attention relevance') * 0.4;
}

function evidenceSummary(input: MakeVideoExecutionInput): Record<EvidenceClass, number> {
  const summary: Record<EvidenceClass, number> = { OBSERVED: 0, INFERRED: 0, UNKNOWN: 0 };
  for (const event of input.causalEvents ?? []) {
    for (const mutation of event.mutations) summary[mutation.confidence] += 1;
  }
  for (const state of input.latentStates ?? []) summary[state.confidence] += 1;
  for (const state of input.accumulatedMeaning ?? []) summary[state.confidence] += 1;
  for (const state of input.relationalStates ?? []) summary[state.confidence] += 1;
  if (input.currentAttention) summary[input.currentAttention.confidence] += 1;
  if (input.incomingAttention) summary[input.incomingAttention.confidence] += 1;
  return summary;
}

function validateDevilReview(review: MakeVideoDevilReview | undefined): void {
  if (!review) return;
  nonEmpty(review.sourceRecordId, 'devil sourceRecordId');
  nonEmpty(review.rationale, 'devil rationale');
  if (!Number.isFinite(Date.parse(review.reviewedAt))) throw new Error('devil reviewedAt must be a valid timestamp');
}

function validateInput(input: MakeVideoExecutionInput): void {
  nonEmpty(input.founderIntent, 'founder intent');
  nonEmpty(input.leeVizeCanon.worldId, 'LEEVIZE worldId');
  unit(input.cognitiveLoad.readingLoad, 'reading load');
  unit(input.cognitiveLoad.listeningLoad, 'listening load');
  unit(input.cognitiveLoad.visualTrackingLoad, 'visual tracking load');
  unit(input.cognitiveLoad.novelty, 'novelty');
  validateDevilReview(input.devilReview);
  for (const state of input.latentStates ?? []) {
    nonNegative(state.persistenceDuration, 'latent persistence duration');
    unit(state.intensity, 'latent intensity');
  }
  for (const state of input.accumulatedMeaning ?? []) {
    if (!Number.isInteger(state.repetitionCount) || state.repetitionCount < 1) {
      throw new Error('accumulated meaning repetitionCount must be a positive integer');
    }
  }
  if (input.currentAttention) {
    attentionScore(input.currentAttention);
    unit(input.currentAttention.focusInertiaCost, 'current focus inertia cost');
  }
  if (input.incomingAttention) {
    attentionScore(input.incomingAttention);
    unit(input.incomingAttention.focusInertiaCost, 'incoming focus inertia cost');
  }
}

function resolveAttention(input: MakeVideoExecutionInput): MakeVideoDirectorPlan['attention'] {
  if (!input.currentAttention || !input.incomingAttention) {
    return { decision: 'UNSPECIFIED', currentScore: null, incomingScore: null, switchThreshold: null };
  }
  const currentScore = attentionScore(input.currentAttention);
  const incomingScore = attentionScore(input.incomingAttention);
  const switchThreshold = Math.min(1, currentScore + unit(input.currentAttention.focusInertiaCost, 'current focus inertia cost'));
  return {
    decision: incomingScore > switchThreshold ? 'SWITCH_TO_INCOMING' : 'KEEP_CURRENT',
    currentScore,
    incomingScore,
    switchThreshold,
  };
}

function temporalPaths(input: MakeVideoExecutionInput): TemporalPath[] {
  const paths: TemporalPath[] = [];
  if ((input.causalEvents?.length ?? 0) > 0) paths.push('CAUSAL_PATH');
  if ((input.latentStates?.length ?? 0) > 0 || (input.accumulatedMeaning?.length ?? 0) > 0) paths.push('ACCUMULATION_PATH');
  return paths;
}

function reconcile(input: MakeVideoExecutionInput, attention: MakeVideoDirectorPlan['attention']): DirectorConflict[] {
  const conflicts: DirectorConflict[] = [];
  const cameraResponse = (input.causalEvents ?? []).some((event) => event.responses.some((response) => response.channel === 'CAMERA'));

  if (input.leeVizeDirectives?.lockCamera && cameraResponse) {
    conflicts.push(makeConflict({
      domain: 'AESTHETIC_VS_CAUSAL',
      leeVizeProposal: 'Keep camera locked to preserve the intended composition.',
      syncAvenueProposal: 'Use an event-related camera response to preserve causal comprehension.',
      resolutionStrategy: 'SYNTHESIZE',
      rationale: 'Preserve LEEVIZE art direction while permitting only the minimum camera response needed to communicate the causal event.',
    }));
  }

  if (input.cognitiveLoad.overloadRisk && input.leeVizeDirectives?.densityPreference === 'DENSE') {
    conflicts.push(makeConflict({
      domain: 'DENSITY_VS_RESTRAINT',
      leeVizeProposal: 'Maintain dense visual information.',
      syncAvenueProposal: 'Create cognitive release or temporally gate new high-attention information.',
      resolutionStrategy: 'SYNTHESIZE',
      rationale: 'Density is not rejected by shot size; the load must be reduced through timing, hierarchy, negative space, silence, or another canon-compatible release mechanism.',
    }));
  }

  for (const meaning of input.accumulatedMeaning ?? []) {
    if (meaning.repetitionCount > 1 && meaning.changedFeatures.length === 0) {
      conflicts.push(makeConflict({
        domain: 'REPETITION_VS_STAGNATION',
        leeVizeProposal: 'Preserve the repeated motif or visual ritual.',
        syncAvenueProposal: 'Do not promote repetition into accumulated meaning without an evidenced context delta.',
        resolutionStrategy: 'OVERRIDE_SYNC',
        rationale: 'Repetition alone is not meaning growth; at least one changed feature or context shift must support an interpretation delta.',
      }));
    }
  }

  if (attention.decision === 'KEEP_CURRENT' && input.incomingAttention) {
    conflicts.push(makeConflict({
      domain: 'FOCUS_SWITCH',
      leeVizeProposal: `Potentially reframe toward ${input.incomingAttention.subjectOrEvent}.`,
      syncAvenueProposal: 'Hold current focus until incoming priority clears the focus-inertia threshold.',
      resolutionStrategy: 'HOLD_FOCUS',
      rationale: 'A meaningful event is not automatically important enough to wrench attention away from the viewer\'s current comprehension target.',
    }));
  }

  return conflicts;
}

function devilPreflightStatus(review: MakeVideoDevilReview | undefined): MakeVideoDirectorPlan['providerRouting']['preflightStatus'] {
  if (!review) return 'BLOCKED';
  if (review.verdict === 'proceed') return 'READY';
  if (review.verdict === 'test') return 'TEST_ONLY';
  return 'BLOCKED';
}

export function compileMakeVideoDirectorPlan(input: MakeVideoExecutionInput): MakeVideoDirectorPlan {
  validateInput(input);

  const paths = temporalPaths(input);
  const attention = resolveAttention(input);
  const conflicts = reconcile(input, attention);
  const directives: string[] = [];
  const summary = evidenceSummary(input);
  const preflightStatus = devilPreflightStatus(input.devilReview);

  if (input.cognitiveLoad.overloadRisk) {
    directives.push('COGNITIVE_RELEASE', 'TEMPORAL_GATE_NEW_HIGH_ATTENTION_CHANNELS');
  }
  if (paths.length === 0) directives.push('DO_NOT_INVENT_CAUSAL_OR_LATENT_STATE');
  if (paths.length === 2) directives.push('RUN_CAUSAL_AND_ACCUMULATION_PATHS_IN_PARALLEL');
  if ((input.viewerContract.hiddenElements?.length ?? 0) > 0) directives.push('HONOR_INFORMATION_WITHHOLD');
  if (attention.decision === 'KEEP_CURRENT') directives.push('HONOR_FOCUS_INERTIA');
  if (summary.UNKNOWN > 0) directives.push('KEEP_UNKNOWN_STATE_NON_AUTHORITATIVE');
  if (preflightStatus === 'BLOCKED') directives.push('BLOCK_PROVIDER_ROUTING_UNTIL_DEVIL_REVIEW_PASSES');
  if (preflightStatus === 'TEST_ONLY') directives.push('ROUTE_TEST_ONLY');

  const canonFingerprint = mediaFingerprint(input.leeVizeCanon);
  const syncState = {
    cognitiveLoad: input.cognitiveLoad,
    currentAttention: input.currentAttention ?? null,
    incomingAttention: input.incomingAttention ?? null,
    causalEvents: input.causalEvents ?? [],
    latentStates: input.latentStates ?? [],
    accumulatedMeaning: input.accumulatedMeaning ?? [],
    relationalStates: input.relationalStates ?? [],
  };
  const stateFingerprint = mediaFingerprint(syncState);
  const continuityFingerprint = mediaFingerprint({
    founderIntent: input.founderIntent.trim(),
    viewerContract: input.viewerContract,
    canonFingerprint,
    stateFingerprint,
  });
  const continuityCookie = `makevideo:${continuityFingerprint.slice(0, 24)}`;

  const withoutFingerprint: Omit<MakeVideoDirectorPlan, 'fingerprint'> = {
    contract: MAKEVIDEO_NERVOUS_SYSTEM_CONTRACT,
    founderIntent: input.founderIntent.trim(),
    viewerContract: input.viewerContract,
    creativeLanes: {
      leevize: {
        role: 'art-direction-and-cinematic-construction',
        canonFingerprint,
      },
      syncAvenue: {
        role: 'temporal-direction-and-continuity-intelligence',
        stateFingerprint,
      },
    },
    temporalPaths: paths,
    attention,
    directives,
    conflicts,
    evidenceSummary: summary,
    continuity: {
      fingerprint: continuityFingerprint,
      cookie: continuityCookie,
    },
    governance: {
      devilReview: input.devilReview ?? null,
      devilReviewPassesRoutingGate: preflightStatus === 'READY' || preflightStatus === 'TEST_ONLY',
      executionAuthority: false,
    },
    providerRouting: {
      authority: 'media-router-only',
      permanentProviderAuthority: false,
      selectionMode: 'cheapest-qualified-live',
      requiredPreflight: ['fingerprint-cookie', 'capability', 'availability', 'budget', 'devil'],
      preflightStatus,
      publishAuthority: false,
    },
    postRenderGates: ['motion-continuity-proof', 'assembly', 'release-authority'],
  };

  return {
    ...withoutFingerprint,
    fingerprint: mediaFingerprint(withoutFingerprint),
  };
}
