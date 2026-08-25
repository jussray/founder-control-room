import { createHash } from 'node:crypto';
import {
  createFounderControlDecision,
  FOUNDER_CONTROL_SURFACES,
  founderControlProposalBindingErrors,
  type FounderControlDecision,
  type FounderControlDecisionValue,
  type FounderControlProposalBinding,
  type FounderControlSurface,
} from './founderControlDecision.js';

export const FOUNDER_PERMISSION_REQUEST_CONTRACT = 'juss-v10/founder-permission-request@v1' as const;
export const FOUNDER_PERMISSION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'change_requested',
] as const;

export type FounderPermissionStatus = (typeof FOUNDER_PERMISSION_STATUSES)[number];

export interface FounderPermissionRequest {
  contract: typeof FOUNDER_PERMISSION_REQUEST_CONTRACT;
  requestId: string;
  requestedBySurface: FounderControlSurface;
  proposal: FounderControlProposalBinding;
  requestHash: string;
  note: string | null;
}

export interface FounderPermissionResolution {
  request: FounderPermissionRequest;
  status: Exclude<FounderPermissionStatus, 'pending'>;
  decision: FounderControlDecision;
  founderPermissionSatisfied: boolean;
  /** Independent review belongs to repository review authority, never this broker. */
  independentReviewSatisfied: null;
}

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,199}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedProposal(input: FounderControlProposalBinding): FounderControlProposalBinding {
  return {
    proposalId: text(input.proposalId),
    proposalHash: text(input.proposalHash).toLowerCase(),
    projectSlug: text(input.projectSlug),
    actionType: text(input.actionType),
    expectedHeadSha: text(input.expectedHeadSha).toLowerCase() || null,
    capabilityPlanHash: text(input.capabilityPlanHash).toLowerCase() || null,
  };
}

function canonicalRequestIdentity(input: {
  requestId: string;
  requestedBySurface: FounderControlSurface;
  proposal: FounderControlProposalBinding;
  note: string | null;
}): string {
  return JSON.stringify([
    FOUNDER_PERMISSION_REQUEST_CONTRACT,
    input.requestId,
    input.requestedBySurface,
    normalizedProposal(input.proposal),
    input.note,
  ]);
}

export function founderPermissionRequestHash(input: {
  requestId: string;
  requestedBySurface: FounderControlSurface;
  proposal: FounderControlProposalBinding;
  note: string | null;
}): string {
  return createHash('sha256').update(canonicalRequestIdentity(input)).digest('hex');
}

export function createFounderPermissionRequest(input: {
  requestId: string;
  requestedBySurface: FounderControlSurface;
  proposal: FounderControlProposalBinding;
  note?: string | null;
}): FounderPermissionRequest {
  const requestId = text(input.requestId);
  if (!REQUEST_ID.test(requestId)) {
    throw new Error('requestId must be a stable 6-200 character identifier');
  }
  if (!FOUNDER_CONTROL_SURFACES.includes(input.requestedBySurface)) {
    throw new Error('unsupported founder control surface');
  }
  const proposal = normalizedProposal(input.proposal);
  const proposalErrors = founderControlProposalBindingErrors(proposal);
  if (proposalErrors.length > 0) {
    throw new Error(proposalErrors.join('; '));
  }
  const note = text(input.note).slice(0, 1000) || null;
  const requestHash = founderPermissionRequestHash({
    requestId,
    requestedBySurface: input.requestedBySurface,
    proposal,
    note,
  });
  return {
    contract: FOUNDER_PERMISSION_REQUEST_CONTRACT,
    requestId,
    requestedBySurface: input.requestedBySurface,
    proposal,
    requestHash,
    note,
  };
}

export function resolveFounderPermissionRequest(input: {
  request: FounderPermissionRequest;
  decisionSurface: FounderControlSurface;
  decision: FounderControlDecisionValue;
}): FounderPermissionResolution {
  if (input.request.contract !== FOUNDER_PERMISSION_REQUEST_CONTRACT) {
    throw new Error('founder permission request contract is unsupported');
  }
  const proposalErrors = founderControlProposalBindingErrors(input.request.proposal);
  if (proposalErrors.length > 0) {
    throw new Error(proposalErrors.join('; '));
  }
  const expectedHash = founderPermissionRequestHash({
    requestId: input.request.requestId,
    requestedBySurface: input.request.requestedBySurface,
    proposal: input.request.proposal,
    note: input.request.note,
  });
  if (input.request.requestHash !== expectedHash) {
    throw new Error('founder permission request hash does not match canonical identity');
  }
  const founderDecision = createFounderControlDecision({
    proposal: input.request.proposal,
    surface: input.decisionSurface,
    decision: input.decision,
  });
  return {
    request: input.request,
    status: input.decision,
    decision: founderDecision,
    founderPermissionSatisfied: input.decision === 'approved',
    independentReviewSatisfied: null,
  };
}
