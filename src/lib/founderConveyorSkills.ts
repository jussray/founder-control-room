import {
  validateV10CapabilityPlanContext,
  type V10CapabilityPlan,
} from '../founder-os-lab/capabilityKernel.js';

export type FounderConveyorSkillStage = 'chat' | 'workflows' | 'code' | 'projects' | 'skills';
export type FounderConveyorSkillId = string;

export interface FounderConveyorCapabilityContext {
  goal: string;
  projectSlug: string;
  expectedHeadSha: string;
}

/**
 * Founder Control Room no longer chooses skills from the conveyor stage.
 * Chief AI Machine selects capabilities and signs that selection by plan hash;
 * FCR validates the plan against execution reality before n8n may advance it.
 */
export function founderConveyorSkillsFromPlan(plan: V10CapabilityPlan): FounderConveyorSkillId[] {
  return [...new Set(plan.capabilities.map((capability) => capability.id.trim()).filter(Boolean))].sort();
}

export function validateFounderConveyorCapabilityPlan(
  plan: V10CapabilityPlan,
  context: FounderConveyorCapabilityContext,
): string[] {
  return validateV10CapabilityPlanContext(plan, context);
}
