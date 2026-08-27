import type { NextFunction, Response } from 'express';
import {
  evaluateV10DecisionAuthorityGate,
} from '../../lib/v10DecisionAuthorityGate.js';
import {
  validateFounderControlDecision,
  type FounderControlDecision,
  type FounderControlProposalBinding,
} from '../../lib/founderControlDecision.js';
import { readFounderSession } from '../../auth/founderSession.js';
import { supabase } from '../../lib/supabaseClient.js';
import type { FounderRequest } from './requireFounder.js';

type JsonRecord = Record<string, unknown>;

interface SanitizedV10ExecutionEnvelope {
  capabilityPlanHash: string;
  expectedHeadSha: string;
  projectSlug: string;
}

export interface TrustedFounderApproval {
  proofResultId: string;
  missionId: string;
  gateId: 'merge';
  status: 'pass';
  approvedBy: string;
  createdAt: string;
}

export interface V10DecisionFounderExecutionBinding {
  decisionHash: string;
  founderDecisionHash: string;
  founderControlSurface: string;
  founderApprovalProofId: string;
  founderApprovedBy: string;
}

export interface V10DecisionFounderBindingInput {
  decisionReceipt: unknown;
  promptOSDecisionHash: string;
  founderDecision: unknown;
  trustedFounderApproval: TrustedFounderApproval | null;
  founderEmail: string;
  missionId: string;
  projectSlug: string;
  expectedHeadSha: string;
  capabilityPlanHash: string;
  currentHeadSha: string;
  nowMs?: number;
}

export interface V10DecisionFounderBindingResult {
  binding: V10DecisionFounderExecutionBinding | null;
  errors: string[];
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const TRUSTED_APPROVAL_TTL_MS = 15 * 60 * 1_000;
const CLOCK_SKEW_MS = 60 * 1_000;

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
 * A persisted proof-gate row is necessary but not, by itself, a distinct
 * founder interaction boundary: the proof-gate route is also founder-authenticated
 * and bearer-capable. Until registered conversational adapters can attest a
 * separate founder action, bearer-only automation must not be able to mint or
 * reuse a structurally valid approval and immediately execute a merge.
 *
 * The real same-origin Control Room browser carries both its API bearer header
 * and the HttpOnly `fcr_session` cookie, so this containment fuse preserves the
 * browser path while rejecting bearer-only merge execution. Non-merge lanes are
 * deliberately unchanged.
 */
export function founderMergeTransportErrors(input: {
  actionType: unknown;
  authorization?: string | null;
  hasFounderCookieSession: boolean;
}): string[] {
  if (text(input.actionType) !== 'merge') return [];
  const authorization = typeof input.authorization === 'string'
    ? input.authorization.trim()
    : '';
  if (/^Bearer\s+\S+/i.test(authorization) && !input.hasFounderCookieSession) {
    return [
      'privileged merge founder approval requires a same-origin founder browser session or a future registered adapter attestation; bearer-only API clients may request permission but may not self-approve merge execution',
    ];
  }
  return [];
}

export function validateTrustedFounderApproval(
  approval: TrustedFounderApproval | null,
  expected: { missionId: string; founderEmail: string; nowMs?: number },
): string[] {
  if (!approval) return ['trusted persisted founder approval is required'];

  const errors: string[] = [];
  const nowMs = expected.nowMs ?? Date.now();
  const createdAtMs = Date.parse(approval.createdAt);
  const expectedFounder = text(expected.founderEmail).toLowerCase();

  if (!text(approval.proofResultId)) errors.push('trusted founder approval proof id is required');
  if (approval.missionId !== expected.missionId) errors.push('trusted founder approval belongs to a different mission');
  if (approval.gateId !== 'merge' || approval.status !== 'pass') {
    errors.push('trusted founder approval is not a passing merge proof');
  }
  if (!expectedFounder || text(approval.approvedBy).toLowerCase() !== expectedFounder) {
    errors.push('trusted founder approval does not belong to the authenticated founder');
  }
  if (!Number.isFinite(createdAtMs)) {
    errors.push('trusted founder approval timestamp is invalid');
  } else {
    if (createdAtMs > nowMs + CLOCK_SKEW_MS) errors.push('trusted founder approval timestamp is in the future');
    if (createdAtMs < nowMs - TRUSTED_APPROVAL_TTL_MS) errors.push('trusted founder approval is stale');
  }

  return [...new Set(errors)];
}

/**
 * Bind the portable Chief decision + PromptOS handoff + founder decision to
 * the exact V10 execution identity already verified by the privileged
 * capability-plan middleware.
 *
 * The client-supplied FounderControlDecision is a scope-consistency receipt,
 * not the source of founder authority. Authority comes from a fresh persisted
 * proof_gate_results row that is read back by this middleware and bound to the
 * authenticated founder before execution may continue.
 */
export function validateV10DecisionFounderBinding(
  input: V10DecisionFounderBindingInput,
): V10DecisionFounderBindingResult {
  const founderDecision = founderDecisionShape(input.founderDecision);
  const trustedApprovalErrors = validateTrustedFounderApproval(input.trustedFounderApproval, {
    missionId: input.missionId,
    founderEmail: input.founderEmail,
    nowMs: input.nowMs,
  });
  const founderDecisionClaimsApproval = Boolean(
    founderDecision
    && founderDecision.founderExplicit === true
    && founderDecision.decision === 'approved'
    && founderDecision.executionAuthorized === true,
  );
  const founderApproved = trustedApprovalErrors.length === 0 && founderDecisionClaimsApproval;

  const authorityGate = evaluateV10DecisionAuthorityGate({
    decisionReceipt: input.decisionReceipt,
    promptOSDecisionHash: input.promptOSDecisionHash,
    expectedProjectSlug: input.projectSlug,
    currentHeadSha: input.currentHeadSha,
    requireExactHead: true,
    founderApproved,
  });

  const errors = [...authorityGate.errors, ...trustedApprovalErrors];
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
    || !input.trustedFounderApproval
  ) {
    return { binding: null, errors: uniqueErrors };
  }

  return {
    binding: {
      decisionHash: authorityGate.decisionHash,
      founderDecisionHash: founderDecision.decisionHash,
      founderControlSurface: founderDecision.surface,
      founderApprovalProofId: input.trustedFounderApproval.proofResultId,
      founderApprovedBy: input.trustedFounderApproval.approvedBy,
    },
    errors: [],
  };
}

async function latestTrustedFounderApproval(
  missionId: string,
): Promise<{ approval: TrustedFounderApproval | null; error: string | null }> {
  const cutoff = new Date(Date.now() - TRUSTED_APPROVAL_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from('proof_gate_results')
    .select('id, mission_id, gate_id, status, approved_by, created_at')
    .eq('mission_id', missionId)
    .eq('gate_id', 'merge')
    .eq('status', 'pass')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { approval: null, error: error.message };
  if (!data) return { approval: null, error: null };

  return {
    approval: {
      proofResultId: text(data.id),
      missionId: text(data.mission_id),
      gateId: text(data.gate_id) as 'merge',
      status: text(data.status) as 'pass',
      approvedBy: text(data.approved_by),
      createdAt: text(data.created_at),
    },
    error: null,
  };
}

/**
 * Second-stage merge middleware. The first V10 middleware verifies the Chief
 * capability plan, founder-approved registry, project identity, and exact
 * repository head. This stage binds the reasoning identity to trusted founder
 * approval read back from FCR persistence before approvals.ts can reserve or
 * mutate anything.
 */
export async function requireV10DecisionFounderBinding(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const body = isRecord(req.body) ? req.body : null;
  if (text(body?.actionType) !== 'merge') return next();

  const transportErrors = founderMergeTransportErrors({
    actionType: body?.actionType,
    authorization: req.header('authorization'),
    hasFounderCookieSession: Boolean(readFounderSession(req)),
  });
  if (transportErrors.length > 0) {
    return res.status(403).json({
      error: 'Interactive founder approval is required for privileged merge execution.',
      code: 'FOUNDER_INTERACTIVE_APPROVAL_REQUIRED',
      reasons: transportErrors,
    });
  }

  const missionId = text(req.params.missionId);
  const founderEmail = text(req.founder?.email);
  const payload = isRecord(body?.payload) ? body.payload : null;
  const envelope = executionEnvelope(payload?._v10);
  if (!missionId || !payload || !envelope) {
    return res.status(409).json({
      error: 'Validated V10 execution identity is required before decision binding.',
      code: 'V10_EXECUTION_ENVELOPE_REQUIRED',
    });
  }
  if (!founderEmail) {
    return res.status(401).json({
      error: 'Authenticated founder identity is required before decision binding.',
      code: 'V10_FOUNDER_IDENTITY_REQUIRED',
    });
  }

  const trusted = await latestTrustedFounderApproval(missionId);
  if (trusted.error) {
    return res.status(503).json({
      error: 'Trusted founder approval could not be read back.',
      code: 'V10_TRUSTED_APPROVAL_UNAVAILABLE',
      detail: trusted.error,
    });
  }
  if (!trusted.approval) {
    return res.status(409).json({
      error: 'A fresh persisted founder merge approval is required before privileged execution.',
      code: 'V10_TRUSTED_APPROVAL_REQUIRED',
    });
  }

  const result = validateV10DecisionFounderBinding({
    decisionReceipt: body?.decisionReceipt,
    promptOSDecisionHash: text(body?.promptOSDecisionHash),
    founderDecision: body?.founderDecision,
    trustedFounderApproval: trusted.approval,
    founderEmail,
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
    founderApprovalProofId: result.binding.founderApprovalProofId,
    founderApprovedBy: result.binding.founderApprovedBy,
  };
  body!.payload = payload;
  return next();
}
