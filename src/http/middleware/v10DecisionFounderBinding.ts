import type { NextFunction, Response } from 'express';
import {
  evaluateV10DecisionAuthorityGate,
} from '../../lib/v10DecisionAuthorityGate.js';
import {
  validateFounderControlDecision,
  type FounderControlDecision,
  type FounderControlProposalBinding,
} from '../../lib/founderControlDecision.js';
import type { FounderRequest } from './requireFounder.js';

type JsonRecord = Record<string, unknown>;

interface SanitizedV10ExecutionEnvelope {
  capabilityPlanHash: string;
  expectedHeadSha: string;
  projectSlug: string;
}

export interface V10DecisionFounderExecutionBinding {
  decisionHash: string;
  founderDecisionHash: string;
  founderControlSurface: string;
}

export interface V10DecisionFounderBindingInput {
  decisionReceipt: unknown;
  promptOSDecisionHash: string;
  founderDecision: unknown;
  missionId: string;
  projectSlug: string;
  expectedHeadSha: string;
  capabilityPlanHash: string;
  currentHeadSha: string;
}

export interface V10DecisionFounderBindingResult {
  binding: V10DecisionFounderExecutionBinding | null;
  errors: string[];
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function founderDecisionShape(value: unknown): FounderControlDecision | null {
  if (!isRecord(value) || !isRecord(value.proposal)) return null;
  return value as unknown as FounderControlDecision;
}

function executionEnvelope(value: unknown): SanitizedV10ExecutionEnvelope | null {
  if (!isRecord(value)) return null;
  const capabilityPlanHash = text(value.capabilityPlanHash).toLowerCase();
  const expectedHeadSha = text(value.expectedHeadSha).toLowerCase();
  const projectSlug = text(value.projectSlug);
  if (!SHA256.test(capabilityPlanHash) || !FULL_SHA.test(expectedHeadSha) || !projectSlug) return null;
  return { capabilityPlanHash, expectedHeadSha, projectSlug };
}

/**
 * Bind the portable Chief decision + PromptOS handoff + explicit founder
 * decision to the exact V10 execution identity already verified by the
 * privileged capability-plan middleware.
 *
 * The proposalHash intentionally equals the validated Chief decision hash.
 * That makes one immutable identity cross all three peer systems instead of
 * allowing the founder approval to authorize a differently interpreted plan.
 */
export function validateV10DecisionFounderBinding(
  input: V10DecisionFounderBindingInput,
): V10DecisionFounderBindingResult {
  const founderDecision = founderDecisionShape(input.founderDecision);
  const founderApproved = Boolean(
    founderDecision
    && founderDecision.founderExplicit === true
    && founderDecision.decision === 'approved'
    && founderDecision.executionAuthorized === true,
  );

  const authorityGate = evaluateV10DecisionAuthorityGate({
    decisionReceipt: input.decisionReceipt,
    promptOSDecisionHash: input.promptOSDecisionHash,
    expectedProjectSlug: input.projectSlug,
    currentHeadSha: input.currentHeadSha,
    requireExactHead: true,
    founderApproved,
  });

  const errors = [...authorityGate.errors];
  if (!founderDecision) {
    errors.push('explicit founder decision is required for privileged merge execution');
  }

  if (!SHA256.test(input.capabilityPlanHash.trim().toLowerCase())) {
    errors.push('capability plan hash is invalid');
  }
  if (!FULL_SHA.test(input.expectedHeadSha.trim().toLowerCase())) {
    errors.push('expected execution head is invalid');
  }

  if (authorityGate.decisionHash && founderDecision) {
    const expectedProposal: FounderControlProposalBinding = {
      proposalId: input.missionId,
      proposalHash: authorityGate.decisionHash,
      projectSlug: input.projectSlug,
      actionType: 'merge',
      expectedHeadSha: input.expectedHeadSha,
      capabilityPlanHash: input.capabilityPlanHash,
    };
    errors.push(...validateFounderControlDecision(founderDecision, expectedProposal));
    if (founderDecision.decision !== 'approved' || founderDecision.executionAuthorized !== true) {
      errors.push('founder decision must explicitly approve privileged merge execution');
    }
  }

  const uniqueErrors = [...new Set(errors)];
  if (
    uniqueErrors.length > 0
    || !authorityGate.acceptedForAuthorityResolution
    || !authorityGate.decisionHash
    || !founderDecision
  ) {
    return { binding: null, errors: uniqueErrors };
  }

  return {
    binding: {
      decisionHash: authorityGate.decisionHash,
      founderDecisionHash: founderDecision.decisionHash,
      founderControlSurface: founderDecision.surface,
    },
    errors: [],
  };
}

/**
 * Second-stage merge middleware. The first V10 middleware verifies the Chief
 * capability plan, founder-approved registry, project identity, and exact
 * repository head. This stage binds the reasoning/approval identity to that
 * already-sanitized execution envelope before approvals.ts can reserve or
 * mutate anything.
 */
export function requireV10DecisionFounderBinding(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const body = isRecord(req.body) ? req.body : null;
  if (text(body?.actionType) !== 'merge') return next();

  const missionId = text(req.params.missionId);
  const payload = isRecord(body?.payload) ? body.payload : null;
  const envelope = executionEnvelope(payload?._v10);
  if (!missionId || !payload || !envelope) {
    return res.status(409).json({
      error: 'Validated V10 execution identity is required before decision binding.',
      code: 'V10_EXECUTION_ENVELOPE_REQUIRED',
    });
  }

  const result = validateV10DecisionFounderBinding({
    decisionReceipt: body?.decisionReceipt,
    promptOSDecisionHash: text(body?.promptOSDecisionHash),
    founderDecision: body?.founderDecision,
    missionId,
    projectSlug: envelope.projectSlug,
    expectedHeadSha: envelope.expectedHeadSha,
    capabilityPlanHash: envelope.capabilityPlanHash,
    currentHeadSha: envelope.expectedHeadSha,
  });

  if (!result.binding) {
    return res.status(409).json({
      error: 'V10 decision/founder binding failed.',
      code: 'V10_DECISION_FOUNDER_BINDING_REJECTED',
      reasons: result.errors,
    });
  }

  payload._v10 = {
    ...(payload._v10 as JsonRecord),
    decisionHash: result.binding.decisionHash,
    founderDecisionHash: result.binding.founderDecisionHash,
    founderControlSurface: result.binding.founderControlSurface,
  };
  body!.payload = payload;
  return next();
}
