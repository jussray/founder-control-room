import type { FounderOsLabPlan } from './contracts.js';

export const FOUNDER_DECISION_CARD_CONTRACT = 'juss-v10/founder-decision-card@v1' as const;

export interface FounderDecisionCard {
  contract: typeof FOUNDER_DECISION_CARD_CONTRACT;
  goal: string;
  presentFounder: {
    command: string;
    commandClass: string;
  };
  futureContinuity: {
    strategicLenses: string[];
    outcomeSignals: string[];
  };
  reality: {
    verified: string[];
    inferred: string[];
    unknown: string[];
    blocked: string[];
  };
  chiefAiRoute: {
    observed: boolean;
    valid: boolean;
    capabilityPlanHash: string | null;
    registryHash: string | null;
    capabilityIds: string[];
  };
  authority: {
    level: 'L0';
    mode: 'simulation';
    approvalRequired: boolean;
    approvalObserved: boolean;
    capabilityPlanBound: boolean;
    executionAllowed: false;
  };
  proof: {
    providerEvidenceRequired: string[];
    providerEvidenceMissing: string[];
  };
  nextMove: string;
}

/**
 * Product Design boundary: this is a view-model only. Rendering it is not runtime
 * proof and does not grant execution authority.
 */
export function founderDecisionCardFromPlan(plan: FounderOsLabPlan): FounderDecisionCard {
  return {
    contract: FOUNDER_DECISION_CARD_CONTRACT,
    goal: plan.goal,
    presentFounder: {
      command: plan.route.command.id,
      commandClass: plan.route.command.class,
    },
    futureContinuity: {
      strategicLenses: [...plan.route.capabilityPlan.strategicLenses],
      outcomeSignals: [...plan.route.capabilityPlan.outcomeSignals],
    },
    reality: {
      verified: [...plan.truth.verified],
      inferred: [...plan.truth.inferred],
      unknown: [...plan.truth.unknown],
      blocked: [...plan.truth.blocked],
    },
    chiefAiRoute: {
      observed: plan.route.capabilityPlan.observed,
      valid: plan.route.capabilityPlan.valid,
      capabilityPlanHash: plan.route.capabilityPlan.planHash,
      registryHash: plan.route.capabilityPlan.registryHash,
      capabilityIds: [...plan.route.capabilityPlan.capabilityIds],
    },
    authority: {
      level: plan.authority.level,
      mode: plan.authority.mode,
      approvalRequired: plan.authority.approvalRequired,
      approvalObserved: plan.authority.approvalObserved,
      capabilityPlanBound: plan.authority.capabilityPlanBound,
      executionAllowed: false,
    },
    proof: {
      providerEvidenceRequired: [...plan.route.provider.evidenceRequired],
      providerEvidenceMissing: [...plan.route.provider.preflightEvidenceMissing],
    },
    nextMove: plan.nextGate,
  };
}
