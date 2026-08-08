import type { FounderConveyorStage } from './n8nConveyor.js';

export const FOUNDER_CONVEYOR_VISUAL_STATES = [
  'waiting',
  'running',
  'blocked',
  'proof-ready',
  'complete',
] as const;

export type FounderConveyorVisualState = (typeof FOUNDER_CONVEYOR_VISUAL_STATES)[number];

export interface FounderConveyorStagePresentation {
  stage: FounderConveyorStage;
  state: FounderConveyorVisualState;
  label: string;
  ariaLabel: string;
  canAdvance: boolean;
  requiresFounderAttention: boolean;
}

const STATE_COPY: Record<FounderConveyorVisualState, Omit<FounderConveyorStagePresentation, 'stage'>> = {
  waiting: {
    state: 'waiting',
    label: 'Waiting',
    ariaLabel: 'Waiting for the previous conveyor stage',
    canAdvance: false,
    requiresFounderAttention: false,
  },
  running: {
    state: 'running',
    label: 'Running',
    ariaLabel: 'Stage is currently running',
    canAdvance: false,
    requiresFounderAttention: false,
  },
  blocked: {
    state: 'blocked',
    label: 'Blocked',
    ariaLabel: 'Stage is blocked and needs founder attention',
    canAdvance: false,
    requiresFounderAttention: true,
  },
  'proof-ready': {
    state: 'proof-ready',
    label: 'Proof ready',
    ariaLabel: 'Stage produced proof and is ready for the next gate',
    canAdvance: true,
    requiresFounderAttention: false,
  },
  complete: {
    state: 'complete',
    label: 'Complete',
    ariaLabel: 'Stage completed with a retained receipt',
    canAdvance: true,
    requiresFounderAttention: false,
  },
};

export function founderConveyorStagePresentation(
  stage: FounderConveyorStage,
  state: FounderConveyorVisualState,
): FounderConveyorStagePresentation {
  return { stage, ...STATE_COPY[state] };
}
