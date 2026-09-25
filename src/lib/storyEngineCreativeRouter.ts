import {
  routeFcrSkills,
  type FcrSkillRoutingDecision,
  type RouteFcrSkillsInput,
} from './fcrSkillRouter.js';
import {
  routeStoryEngineCourt,
  type StoryEngineCourtDecision,
} from './storyEngineCourt.js';

export const FCR_STORYENGINE_CREATIVE_ROUTER_CONTRACT =
  'juss/fcr-storyengine-creative-router@v1' as const;

export interface StoryEngineCreativeRoutingDecision {
  contract: typeof FCR_STORYENGINE_CREATIVE_ROUTER_CONTRACT;
  status: 'blocked' | 'ready_for_runtime_discovery';
  fcr: FcrSkillRoutingDecision;
  court: StoryEngineCourtDecision;
  requiredProof: string[];
  errors: string[];
  runtimeDiscoveryRequired: true;
  executionAllowed: false;
  nextGate: string;
}

function normalizeCapabilityId(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/^(skill|command):/, '');
}

/**
 * Canonical StoryEngine creative route through Founder Control Room.
 *
 * The generic FCR router remains the authority/proof membrane. This adapter
 * adds the StoryEngine three-council Court without duplicating FCR authority.
 * It never invokes providers and never authorizes execution.
 */
export function routeStoryEngineCreativeWork(
  input: RouteFcrSkillsInput,
): StoryEngineCreativeRoutingDecision {
  const fcr = routeFcrSkills(input);
  const court = routeStoryEngineCourt(input.goal, input.projectSlug);
  const errors = [...fcr.errors];
  const requiredProof = [...fcr.requiredProof];

  for (const proof of court.requiredProof) {
    if (!requiredProof.includes(proof)) requiredProof.push(proof);
  }

  if (court.applies) {
    const plannedCapabilities = new Set(
      (input.capabilityPlan?.capabilities ?? []).map((capability) => normalizeCapabilityId(capability.id)),
    );

    for (const requiredCapability of court.policyRequiredCapabilityIds) {
      if (!plannedCapabilities.has(normalizeCapabilityId(requiredCapability))) {
        errors.push(
          `StoryEngine Court requires Chief AI capability plan to include: ${requiredCapability}`,
        );
      }
    }
  }

  const status = errors.length === 0 ? fcr.status : 'blocked';
  const nextGate = status === 'blocked'
    ? 'Return FCR and StoryEngine Court policy failures to Chief AI. Require a corrected hash-bound capability plan before provider discovery, creative execution, canon mutation, or publication.'
    : 'Discover only the validated runtime capabilities. Convene the three-domain StoryEngine Court independently first, run /DEVIL cross-examination, preserve creator escape routes, then return one non-authorizing synthesis for creator ruling.';

  return {
    contract: FCR_STORYENGINE_CREATIVE_ROUTER_CONTRACT,
    status,
    fcr,
    court,
    requiredProof,
    errors,
    runtimeDiscoveryRequired: true,
    executionAllowed: false,
    nextGate,
  };
}
