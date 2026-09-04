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
