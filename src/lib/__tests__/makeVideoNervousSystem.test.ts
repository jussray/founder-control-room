import { describe, expect, it } from 'vitest';

import {
  MAKEVIDEO_NERVOUS_SYSTEM_CONTRACT,
  compileMakeVideoDirectorPlan,
  type MakeVideoExecutionInput,
} from '../makeVideoNervousSystem.js';

function baseInput(): MakeVideoExecutionInput {
  return {
    founderIntent: 'Make the scene feel alive while preserving the visual world.',
    viewerContract: {
      explicitFocus: ['main subject'],
      peripheralAwareness: ['environment response'],
      atmosphericSignals: ['music motif'],
      hiddenElements: [],
    },
    leeVizeCanon: {
      worldId: 'world-1',
      artStyle: 'cinematic realism',
      colorPalette: ['purple', 'blue'],
      lightingProfile: {
        keyLightAngle: 45,
        shadowDensity: 0.5,
        colorTemperatureK: 4400,
      },
      shotLanguagePreferences: {
        preferredFocalLengths: [35, 50],
        framingStances: ['MEDIUM', 'CLOSE_UP'],
        compositionRules: ['preserve subject silhouette'],
      },
      characterCanons: [{
        characterId: 'subject-1',
        identityFingerprint: 'a'.repeat(64),
        wardrobeState: 'look-1',
      }],
    },
    cognitiveLoad: {
      activeConcepts: ['motion', 'story'],
      readingLoad: 0.2,
      listeningLoad: 0.3,
      visualTrackingLoad: 0.4,
      novelty: 0.5,
      overloadRisk: false,
      releaseConditionMet: false,
    },
  };
}

describe('compileMakeVideoDirectorPlan', () => {
  it('keeps /LEEVIZE and Sync Avenue as peer creative lanes under /MAKEVIDEO', () => {
    const plan = compileMakeVideoDirectorPlan(baseInput());

    expect(plan.contract).toBe(MAKEVIDEO_NERVOUS_SYSTEM_CONTRACT);
    expect(plan.creativeLanes.leevize.role).toBe('art-direction-and-cinematic-construction');
    expect(plan.creativeLanes.syncAvenue.role).toBe('temporal-direction-and-continuity-intelligence');
    expect(plan.creativeLanes.leevize.canonFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.creativeLanes.syncAvenue.stateFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('runs causal and accumulation paths together instead of forcing a false either-or', () => {
    const input = baseInput();
    input.causalEvents = [{
      id: 'event-1',
      observedCause: 'door closes',
      onsetTimestamp: 1.2,
      evidenceRefs: ['video:frame:1200'],
      mutations: [{
        subsystem: 'ENVIRONMENT',
        before: 'door-open',
        after: 'door-closed',
        confidence: 'OBSERVED',
        evidenceRefs: ['video:frame:1200'],
      }],
      responses: [{
        channel: 'AUDIO',
        responseDescription: 'impact sound confirms closure',
        phase: 'IMPACT',
        role: 'confirm state change',
        evidenceRefs: ['audio:1200'],
      }],
    }];
    input.latentStates = [{
      id: 'latent-1',
      subjectOrRelationship: 'two-character tension',
      observedSignals: ['averted gaze'],
      confidence: 'INFERRED',
      persistenceDuration: 4,
      intensity: 0.6,
      reinforcementEvents: ['event-1'],
      contradictionEvents: [],
      lastObservedTimestamp: 1.2,
      unresolved: true,
      evidenceRefs: ['video:frame:1200'],
    }];

    const plan = compileMakeVideoDirectorPlan(input);

    expect(plan.temporalPaths).toEqual(['CAUSAL_PATH', 'ACCUMULATION_PATH']);
    expect(plan.directives).toContain('RUN_CAUSAL_AND_ACCUMULATION_PATHS_IN_PARALLEL');
    expect(plan.evidenceSummary).toMatchObject({ OBSERVED: 1, INFERRED: 1, UNKNOWN: 0 });
  });

  it('enforces focus inertia without pretending every meaningful event deserves a camera switch', () => {
    const input = baseInput();
    input.currentAttention = {
      subjectOrEvent: 'speaker',
      awarenessLevel: 'PRIMARY_FOCUS',
      urgency: 0.5,
      relevance: 0.9,
      spatialRelationship: 'center frame',
      focusInertiaCost: 0.2,
      confidence: 'OBSERVED',
      evidenceRefs: ['frame:speaker'],
    };
    input.incomingAttention = {
      subjectOrEvent: 'background movement',
      awarenessLevel: 'SECONDARY_AWARENESS',
      urgency: 0.6,
      relevance: 0.4,
      spatialRelationship: 'background left',
      focusInertiaCost: 0.1,
      confidence: 'OBSERVED',
      evidenceRefs: ['frame:background'],
    };

    const plan = compileMakeVideoDirectorPlan(input);

    expect(plan.attention.decision).toBe('KEEP_CURRENT');
    expect(plan.directives).toContain('HONOR_FOCUS_INERTIA');
    expect(plan.conflicts.some((conflict) => conflict.domain === 'FOCUS_SWITCH')).toBe(true);
  });

  it('uses cognitive release without treating close-ups as inherently overloaded', () => {
    const input = baseInput();
    input.cognitiveLoad = { ...input.cognitiveLoad, overloadRisk: true };

    const plan = compileMakeVideoDirectorPlan(input);

    expect(plan.directives).toContain('COGNITIVE_RELEASE');
    expect(plan.conflicts.some((conflict) => conflict.domain === 'DENSITY_VS_RESTRAINT')).toBe(false);
  });

  it('rejects fake accumulated meaning when repetition has no context delta', () => {
    const input = baseInput();
    input.accumulatedMeaning = [{
      signalId: 'stairs',
      repetitionCount: 3,
      invariantFeatures: ['same location'],
      changedFeatures: [],
      priorContext: { encounter: 1 },
      currentContext: { encounter: 3 },
      interpretationDelta: 'claimed deeper meaning',
      confidence: 'INFERRED',
      evidenceRefs: ['clip:stairs'],
    }];

    const plan = compileMakeVideoDirectorPlan(input);
    const conflict = plan.conflicts.find((candidate) => candidate.domain === 'REPETITION_VS_STAGNATION');

    expect(conflict?.resolutionStrategy).toBe('OVERRIDE_SYNC');
    expect(conflict?.rationale).toContain('Repetition alone is not meaning growth');
  });

  it('keeps providers as replaceable workers and requires /devil before routing', () => {
    const plan = compileMakeVideoDirectorPlan(baseInput());

    expect(plan.providerRouting).toEqual({
      authority: 'media-router-only',
      permanentProviderAuthority: false,
      selectionMode: 'cheapest-qualified-live',
      requiredPreflight: ['capability', 'availability', 'budget', 'devil'],
      publishAuthority: false,
    });
  });

  it('is deterministic so continuity fingerprints do not drift between identical compilations', () => {
    const first = compileMakeVideoDirectorPlan(baseInput());
    const second = compileMakeVideoDirectorPlan(baseInput());

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.conflicts.map((conflict) => conflict.conflictId)).toEqual(second.conflicts.map((conflict) => conflict.conflictId));
  });

  it('preserves unknown evidence as non-authoritative instead of promoting it', () => {
    const input = baseInput();
    input.latentStates = [{
      id: 'latent-unknown',
      subjectOrRelationship: 'unresolved relationship',
      observedSignals: [],
      confidence: 'UNKNOWN',
      persistenceDuration: 2,
      intensity: 0.2,
      reinforcementEvents: [],
      contradictionEvents: [],
      lastObservedTimestamp: 2,
      unresolved: true,
      evidenceRefs: [],
    }];

    const plan = compileMakeVideoDirectorPlan(input);

    expect(plan.evidenceSummary.UNKNOWN).toBe(1);
    expect(plan.directives).toContain('KEEP_UNKNOWN_STATE_NON_AUTHORITATIVE');
  });
});
