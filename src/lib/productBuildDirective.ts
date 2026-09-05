import { createHash } from 'node:crypto';
import {
  validateFounderControlDecision,
  type FounderControlDecision,
  type FounderControlProposalBinding,
} from './founderControlDecision.js';

export const PRODUCT_BUILD_DIRECTIVE_CONTRACT = 'juss-v10/product-build-directive@v1' as const;
export const PRODUCT_BUILD_RECEIPT_CONTRACT = 'juss-v10/product-build-receipt@v1' as const;

const SHA256 = /^[0-9a-f]{64}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface ProductBuildDirective {
  contract: typeof PRODUCT_BUILD_DIRECTIVE_CONTRACT;
  directiveId: string;
  proposal: FounderControlProposalBinding;
  founderDecisionHash: string;
  productControlRoomId: string;
  repository: string;
  objective: string;
  allowedCapabilities: string[];
  allowedMutationScope: string[];
  authorityCeiling: 'reversible_product_change';
  requiredProof: string[];
  stopConditions: string[];
  rollback: string;
  chiefCapabilityPlanRequired: true;
  executionAuthorized: true;
  receiptRequired: true;
  mergeAuthorized: false;
  deployAuthorized: false;
  providerMutationAuthorized: false;
  directiveHash: string;
}

export interface ProductBuildReceipt {
  contract: typeof PRODUCT_BUILD_RECEIPT_CONTRACT;
  directiveHash: string;
  productControlRoomId: string;
  repository: string;
  status: 'completed' | 'blocked';
  changedResources: string[];
  proofRefs: string[];
  executionReceiptId: string;
  mergePerformed: false;
  deployPerformed: false;
  providerMutationPerformed: false;
  receiptHash: string;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(text).filter(Boolean))].sort();
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

function proposalFromUnknown(value: unknown): FounderControlProposalBinding | null {
  const candidate = record(value);
  if (!candidate) return null;
  return normalizedProposal({
    proposalId: text(candidate.proposalId),
    proposalHash: text(candidate.proposalHash),
    projectSlug: text(candidate.projectSlug),
    actionType: text(candidate.actionType),
    expectedHeadSha: text(candidate.expectedHeadSha) || null,
    capabilityPlanHash: text(candidate.capabilityPlanHash) || null,
  });
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function directiveIdentity(input: Omit<ProductBuildDirective, 'directiveHash'>): unknown[] {
  return [
    PRODUCT_BUILD_DIRECTIVE_CONTRACT,
    input.directiveId,
    normalizedProposal(input.proposal),
    input.founderDecisionHash,
    input.productControlRoomId,
    input.repository,
    input.objective,
    normalizedList(input.allowedCapabilities),
    normalizedList(input.allowedMutationScope),
    input.authorityCeiling,
    normalizedList(input.requiredProof),
    normalizedList(input.stopConditions),
    input.rollback,
    true,
    true,
    true,
    false,
    false,
    false,
  ];
}

export function productBuildDirectiveHash(input: Omit<ProductBuildDirective, 'directiveHash'>): string {
  return digest(directiveIdentity(input));
}

export function createProductBuildDirective(input: {
  directiveId: string;
  founderDecision: FounderControlDecision;
  proposal: FounderControlProposalBinding;
  productControlRoomId: string;
  repository: string;
  objective: string;
  allowedCapabilities: string[];
  allowedMutationScope: string[];
  requiredProof: string[];
  stopConditions: string[];
  rollback: string;
}): ProductBuildDirective {
  const proposal = normalizedProposal(input.proposal);
  const decisionErrors = validateFounderControlDecision(input.founderDecision, proposal);
  if (decisionErrors.length > 0) throw new Error(decisionErrors.join('; '));
  if (input.founderDecision.decision !== 'approved' || input.founderDecision.executionAuthorized !== true) {
    throw new Error('exact founder approval is required before a product build directive can be created');
  }
  if (!proposal.expectedHeadSha || !FULL_SHA.test(proposal.expectedHeadSha)) {
    throw new Error('product build directives require an exact expectedHeadSha');
  }
  if (!proposal.capabilityPlanHash || !SHA256.test(proposal.capabilityPlanHash)) {
    throw new Error('product build directives require a Chief capabilityPlanHash');
  }

  const directiveId = text(input.directiveId);
  const productControlRoomId = text(input.productControlRoomId);
  const repository = text(input.repository);
  const objective = text(input.objective);
  const allowedCapabilities = normalizedList(input.allowedCapabilities);
  const allowedMutationScope = normalizedList(input.allowedMutationScope);
  const requiredProof = normalizedList(input.requiredProof);
  const stopConditions = normalizedList(input.stopConditions);
  const rollback = text(input.rollback);

  if (!directiveId) throw new Error('directiveId is required');
  if (!productControlRoomId) throw new Error('productControlRoomId is required');
  if (!REPOSITORY.test(repository)) throw new Error('repository must be an owner/name repository identity');
  if (!objective) throw new Error('objective is required');
  if (allowedCapabilities.length === 0) throw new Error('allowedCapabilities must contain at least one capability');
  if (allowedMutationScope.length === 0) throw new Error('allowedMutationScope must contain at least one bounded mutation target');
  if (requiredProof.length === 0) throw new Error('requiredProof must contain at least one proof requirement');
  if (stopConditions.length === 0) throw new Error('stopConditions must contain at least one stop condition');
  if (!rollback) throw new Error('rollback is required');

  const withoutHash: Omit<ProductBuildDirective, 'directiveHash'> = {
    contract: PRODUCT_BUILD_DIRECTIVE_CONTRACT,
    directiveId,
    proposal,
    founderDecisionHash: input.founderDecision.decisionHash,
    productControlRoomId,
    repository,
    objective,
    allowedCapabilities,
    allowedMutationScope,
    authorityCeiling: 'reversible_product_change',
    requiredProof,
    stopConditions,
    rollback,
    chiefCapabilityPlanRequired: true,
    executionAuthorized: true,
    receiptRequired: true,
    mergeAuthorized: false,
    deployAuthorized: false,
    providerMutationAuthorized: false,
  };

  return { ...withoutHash, directiveHash: productBuildDirectiveHash(withoutHash) };
}

export function validateProductBuildDirective(value: unknown): string[] {
  const candidate = record(value);
  if (!candidate) return ['product build directive shape is invalid'];

  const errors: string[] = [];
  const proposal = proposalFromUnknown(candidate.proposal);
  const directiveId = text(candidate.directiveId);
  const founderDecisionHash = text(candidate.founderDecisionHash).toLowerCase();
  const productControlRoomId = text(candidate.productControlRoomId);
  const repository = text(candidate.repository);
  const objective = text(candidate.objective);
  const allowedCapabilities = normalizedList(candidate.allowedCapabilities);
  const allowedMutationScope = normalizedList(candidate.allowedMutationScope);
  const requiredProof = normalizedList(candidate.requiredProof);
  const stopConditions = normalizedList(candidate.stopConditions);
  const rollback = text(candidate.rollback);
  const directiveHash = text(candidate.directiveHash).toLowerCase();

  if (candidate.contract !== PRODUCT_BUILD_DIRECTIVE_CONTRACT) errors.push('product build directive contract is unsupported');
  if (!directiveId) errors.push('product build directiveId is required');
  if (!proposal) {
    errors.push('product build directive proposal is invalid');
  } else {
    if (!proposal.proposalId) errors.push('product build proposalId is required');
    if (!SHA256.test(proposal.proposalHash)) errors.push('product build proposalHash must be sha256');
    if (!proposal.projectSlug) errors.push('product build projectSlug is required');
    if (!proposal.actionType) errors.push('product build actionType is required');
    if (!proposal.expectedHeadSha || !FULL_SHA.test(proposal.expectedHeadSha)) errors.push('product build expectedHeadSha must be a full Git SHA');
    if (!proposal.capabilityPlanHash || !SHA256.test(proposal.capabilityPlanHash)) errors.push('product build capabilityPlanHash must be sha256');
  }
  if (!SHA256.test(founderDecisionHash)) errors.push('product build founderDecisionHash must be sha256');
  if (!productControlRoomId) errors.push('product build control room identity is required');
  if (!REPOSITORY.test(repository)) errors.push('product build repository identity is invalid');
  if (!objective) errors.push('product build objective is required');
  if (allowedCapabilities.length === 0) errors.push('product build allowedCapabilities are required');
  if (allowedMutationScope.length === 0) errors.push('product build allowedMutationScope is required');
  if (candidate.authorityCeiling !== 'reversible_product_change') errors.push('product build authority ceiling is unsupported');
  if (requiredProof.length === 0) errors.push('product build requiredProof is required');
  if (stopConditions.length === 0) errors.push('product build stopConditions are required');
  if (!rollback) errors.push('product build rollback is required');
  if (candidate.chiefCapabilityPlanRequired !== true) errors.push('product build requires Chief capability-plan evidence');
  if (candidate.executionAuthorized !== true) errors.push('product build execution must be explicitly authorized');
  if (candidate.receiptRequired !== true) errors.push('product build receipt must be required');
  if (candidate.mergeAuthorized !== false) errors.push('product build directive cannot grant merge authority');
  if (candidate.deployAuthorized !== false) errors.push('product build directive cannot grant deploy authority');
  if (candidate.providerMutationAuthorized !== false) errors.push('product build directive cannot grant provider mutation authority');
  if (!SHA256.test(directiveHash)) errors.push('product build directiveHash must be sha256');

  if (proposal && errors.length === 0) {
    const expectedHash = productBuildDirectiveHash({
      contract: PRODUCT_BUILD_DIRECTIVE_CONTRACT,
      directiveId,
      proposal,
      founderDecisionHash,
      productControlRoomId,
      repository,
      objective,
      allowedCapabilities,
      allowedMutationScope,
      authorityCeiling: 'reversible_product_change',
      requiredProof,
      stopConditions,
      rollback,
      chiefCapabilityPlanRequired: true,
      executionAuthorized: true,
      receiptRequired: true,
      mergeAuthorized: false,
      deployAuthorized: false,
      providerMutationAuthorized: false,
    });
    if (directiveHash !== expectedHash) errors.push('product build directive hash does not match the canonical directive identity');
  }

  return [...new Set(errors)];
}

function receiptIdentity(receipt: Omit<ProductBuildReceipt, 'receiptHash'>): unknown[] {
  return [
    PRODUCT_BUILD_RECEIPT_CONTRACT,
    receipt.directiveHash,
    receipt.productControlRoomId,
    receipt.repository,
    receipt.status,
    normalizedList(receipt.changedResources),
    normalizedList(receipt.proofRefs),
    receipt.executionReceiptId,
    false,
    false,
    false,
  ];
}

export function productBuildReceiptHash(receipt: Omit<ProductBuildReceipt, 'receiptHash'>): string {
  return digest(receiptIdentity(receipt));
}

export function validateProductBuildReceipt(
  receipt: ProductBuildReceipt,
  directive: ProductBuildDirective,
): string[] {
  const errors: string[] = [];
  if (receipt.contract !== PRODUCT_BUILD_RECEIPT_CONTRACT) errors.push('product build receipt contract is unsupported');
  if (receipt.directiveHash !== directive.directiveHash) errors.push('product build receipt is not bound to the exact directive');
  if (receipt.productControlRoomId !== directive.productControlRoomId) errors.push('product build receipt control room identity mismatch');
  if (receipt.repository !== directive.repository) errors.push('product build receipt repository mismatch');
  if (!['completed', 'blocked'].includes(receipt.status)) errors.push('product build receipt status is unsupported');
  if (!text(receipt.executionReceiptId)) errors.push('product build receipt executionReceiptId is required');
  if (receipt.mergePerformed !== false) errors.push('product build receipt cannot claim merge authority');
  if (receipt.deployPerformed !== false) errors.push('product build receipt cannot claim deploy authority');
  if (receipt.providerMutationPerformed !== false) errors.push('product build receipt cannot claim provider mutation authority');
  if (receipt.status === 'completed' && normalizedList(receipt.proofRefs).length === 0) {
    errors.push('completed product build receipt requires proofRefs');
  }
  const expectedHash = productBuildReceiptHash({
    contract: PRODUCT_BUILD_RECEIPT_CONTRACT,
    directiveHash: receipt.directiveHash,
    productControlRoomId: receipt.productControlRoomId,
    repository: receipt.repository,
    status: receipt.status,
    changedResources: normalizedList(receipt.changedResources),
    proofRefs: normalizedList(receipt.proofRefs),
    executionReceiptId: text(receipt.executionReceiptId),
    mergePerformed: false,
    deployPerformed: false,
    providerMutationPerformed: false,
  });
  if (receipt.receiptHash !== expectedHash) errors.push('product build receipt hash does not match the canonical receipt identity');
  return [...new Set(errors)];
}
