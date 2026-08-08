export const FOUNDER_CONVEYOR_SKILLS = [
  'lean-build-orchestrator',
  'regression-stagnation-guard',
  'truth-research-optimizer',
  'intent-repair-reader',
  'capability-mode-router',
] as const;

export type FounderConveyorSkillId = (typeof FOUNDER_CONVEYOR_SKILLS)[number];

export type FounderConveyorSkillStage = 'chat' | 'workflows' | 'code' | 'projects' | 'skills';

const SKILLS_BY_STAGE: Readonly<Record<FounderConveyorSkillStage, readonly FounderConveyorSkillId[]>> = {
  chat: ['intent-repair-reader', 'capability-mode-router'],
  workflows: ['lean-build-orchestrator', 'capability-mode-router'],
  code: ['lean-build-orchestrator', 'regression-stagnation-guard', 'capability-mode-router'],
  projects: ['regression-stagnation-guard', 'truth-research-optimizer'],
  skills: ['truth-research-optimizer', 'capability-mode-router'],
};

export function founderConveyorSkillsForStage(stage: FounderConveyorSkillStage): readonly FounderConveyorSkillId[] {
  return SKILLS_BY_STAGE[stage];
}
