import { createHash } from 'node:crypto';
import {
  FOUNDER_CONTROL_SURFACES,
  founderControlProposalBindingErrors,
  type FounderControlDecisionValue,
  type FounderControlProposalBinding,
  type FounderControlSurface,
} from './founderControlDecision.js';

export const FOUNDER_PERMISSION_REQUEST_CONTRACT = 'juss-v10/founder-permission-request@v1' as const;
export const FOUNDER_PERMISSION_DECISION_CONTRACT = 'juss-v10/founder-permission-decision@v1' as const;
export const FOUNDER_PERMISSION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'change_requested',
] as const;

export type FounderPermissionStatus = (typeof FOUNDER_PERMISSION_STATUSES)[number];

export interface FounderPermissionMergeTarget {
  type: 'merge';
  repo: string;
  pullRequestNumber: number;
  baseSha: string;
  headSha: string;
}

export type FounderPermissionActionTarget = FounderPermissionMergeTarget | null;

export interface FounderPermissionRequest {
  contract: typeof FOUNDER_PERMISSION_REQUEST_CONTRACT;
  requestId: string;
  requestedBySurface: FounderControlSurface;
  proposal: FounderControlProposalBinding;
  actionTarget: FounderPermissionActionTarget;
  requestHash: string;
  note: string | null;
}

export interface FounderPermissionDecisionRecord {
  contract: typeof FOUNDER_PERMISSION_DECISION_CONTRACT;
  requestHash: string;
  surface: 'fcr';
  decision: FounderControlDecisionValue;
  founderExplicit: true;
  /**
   * The broker records a founder decision. Exact execution authority belongs to
   * the separately scoped FounderPermissionReceipt / execution-binding layer.
   */
  executionAuthorized: false;
  decisionHash: string;
}

export interface FounderPermissionResolution {
  request: FounderPermissionRequest;
  status: Exclude<FounderPermissionStatus, 'pending'>;
  decision: FounderPermissionDecisionRecord;
  /** Becomes true only at the durable fresh/unconsumed row boundary, never here. */
  founderPermissionSatisfied: false;
  /** Independent review belongs to repository review authority, never this broker. */
  independentReviewSatisfied: null;
}

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,199}$/;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;

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

function normalizedActionTarget(
  proposal: FounderControlProposalBinding,
  input: FounderPermissionActionTarget | undefined,
): FounderPermissionActionTarget {
  if (proposal.actionType !== 'merge') {
    if (input) throw new Error('actionTarget is only supported for merge requests in this broker version');
    return null;
  }

  if (!input || input.type !== 'merge') {
    throw new Error('merge requests require an exact merge actionTarget');
  }

  const repo = text(input.repo).toLowerCase();
  const baseSha = text(input.baseSha).toLowerCase();
  const headSha = text(input.headSha).toLowerCase();
  if (!OWNED_REPO.test(repo)) throw new Error('merge actionTarget requires an owned repository identity');
  if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) {
    throw new Error('merge actionTarget requires a positive pull request number');
  }
  if (!FULL_SHA.test(baseSha) || !FULL_SHA.test(headSha)) {
    throw new Error('merge actionTarget requires exact base and head SHAs');
  }
  if (!proposal.expectedHeadSha || proposal.expectedHeadSha.toLowerCase() !== headSha) {
    throw new Error('merge proposal expectedHeadSha must equal actionTarget headSha');
  }

  return {
    type: 'merge',
    repo,
    pullRequestNumber: input.pullRequestNumber,
    baseSha,
    headSha,
  };
}

function canonicalRequestIdentity(input: {
  requestId: string;
  requestedBySurface: FounderControlSurface;
  proposal: FounderControlProposalBinding;
  actionTarget: FounderPermissionActionTarget;
  note: string | null;
}): string {
  return JSON.stringify([
    FOUNDER_PERMISSION_REQUEST_CONTRACT,
    input.requestId,
    input.requestedBySurface,
    normalizedProposal(input.proposal),
    input.actionTarget,
    input.note,
  ]);
}

export function founderPermissionRequestHash(input: {
  requestId: string;
  requestedBySurface: FounderControlSurface;
  proposal: FounderControlProposalBinding;
  actionTarget: FounderPermissionActionTarget;
  note: string | null;
}): string {
  return createHash('sha256').update(canonicalRequestIdentity(input)).digest('hex');
}

export function founderPermissionDecisionHash(input: {
  requestHash: string;
  decision: FounderControlDecisionValue;
}): string {
  return createHash('sha256').update(JSON.stringify([
    FOUNDER_PERMISSION_DECISION_CONTRACT,
    input.requestHash,
    'fcr',
    input.decision,
    true,
    false,
  ])).digest('hex');
}

export function createFounderPermissionRequest(input: {
  requestId: string;
  requestedBySurface: FounderControlSurface;
  proposal: FounderControlProposalBinding;
  actionTarget?: FounderPermissionActionTarget;
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
  const actionTarget = normalizedActionTarget(proposal, input.actionTarget);
  const note = text(input.note).slice(0, 1000) || null;
  const requestHash = founderPermissionRequestHash({
    requestId,
    requestedBySurface: input.requestedBySurface,
    proposal,
    actionTarget,
    note,
  });
  return {
    contract: FOUNDER_PERMISSION_REQUEST_CONTRACT,
    requestId,
    requestedBySurface: input.requestedBySurface,
    proposal,
    actionTarget,
    requestHash,
    note,
  };
}

export function resolveFounderPermissionRequest(input: {
  request: FounderPermissionRequest;
  decision: FounderControlDecisionValue;
}): FounderPermissionResolution {
  if (input.request.contract !== FOUNDER_PERMISSION_REQUEST_CONTRACT) {
    throw new Error('founder permission request contract is unsupported');
  }
  const proposalErrors = founderControlProposalBindingErrors(input.request.proposal);
  if (proposalErrors.length > 0) {
    throw new Error(proposalErrors.join('; '));
  }
  const actionTarget = normalizedActionTarget(input.request.proposal, input.request.actionTarget);
  const expectedHash = founderPermissionRequestHash({
    requestId: input.request.requestId,
    requestedBySurface: input.request.requestedBySurface,
    proposal: input.request.proposal,
    actionTarget,
    note: input.request.note,
  });
  if (input.request.requestHash !== expectedHash) {
    throw new Error('founder permission request hash does not match canonical identity');
  }
  if (!['approved', 'rejected', 'change_requested'].includes(input.decision)) {
    throw new Error('unsupported founder decision');
  }

  const decision: FounderPermissionDecisionRecord = {
    contract: FOUNDER_PERMISSION_DECISION_CONTRACT,
    requestHash: expectedHash,
    surface: 'fcr',
    decision: input.decision,
    founderExplicit: true,
    executionAuthorized: false,
    decisionHash: founderPermissionDecisionHash({
      requestHash: expectedHash,
      decision: input.decision,
    }),
  };

  return {
    request: input.request,
    status: input.decision,
    decision,
    founderPermissionSatisfied: false,
    independentReviewSatisfied: null,
  };
}
