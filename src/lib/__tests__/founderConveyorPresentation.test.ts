import { describe, expect, it } from 'vitest';
import {
  FOUNDER_CONVEYOR_VISUAL_STATES,
  founderConveyorStagePresentation,
} from '../founderConveyorPresentation.js';

describe('founder conveyor presentation states', () => {
  it('keeps the human-visible state vocabulary stable', () => {
    expect(FOUNDER_CONVEYOR_VISUAL_STATES).toEqual([
      'waiting',
      'running',
      'blocked',
      'proof-ready',
      'complete',
    ]);
  });

  it('never allows blocked work to advance', () => {
    expect(founderConveyorStagePresentation('code', 'blocked')).toMatchObject({
      canAdvance: false,
      requiresFounderAttention: true,
      label: 'Blocked',
    });
  });

  it('only marks proof-bearing states as advanceable', () => {
    expect(founderConveyorStagePresentation('projects', 'proof-ready').canAdvance).toBe(true);
    expect(founderConveyorStagePresentation('skills', 'complete').canAdvance).toBe(true);
    expect(founderConveyorStagePresentation('workflows', 'running').canAdvance).toBe(false);
  });
});
