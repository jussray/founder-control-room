import { describe, expect, it } from 'vitest';
import {
  FOUNDER_CONVEYOR_SKILLS,
  founderConveyorSkillsForStage,
} from '../founderConveyorSkills.js';

describe('founder conveyor skill routing', () => {
  it('keeps the portable five-skill suite registered', () => {
    expect(FOUNDER_CONVEYOR_SKILLS).toEqual([
      'lean-build-orchestrator',
      'regression-stagnation-guard',
      'truth-research-optimizer',
      'intent-repair-reader',
      'capability-mode-router',
    ]);
  });

  it('routes intent repair at chat intake', () => {
    expect(founderConveyorSkillsForStage('chat')).toEqual([
      'intent-repair-reader',
      'capability-mode-router',
    ]);
  });

  it('adds regression protection to code execution', () => {
    expect(founderConveyorSkillsForStage('code')).toEqual([
      'lean-build-orchestrator',
      'regression-stagnation-guard',
      'capability-mode-router',
    ]);
  });

  it('uses truth research when project context becomes reusable skill knowledge', () => {
    expect(founderConveyorSkillsForStage('skills')).toContain('truth-research-optimizer');
  });
});
