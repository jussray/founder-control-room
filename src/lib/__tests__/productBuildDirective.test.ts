import { describe, expect, it } from 'vitest';
import { createFounderControlDecision, type FounderControlProposalBinding } from '../founderControlDecision.js';
import {
  createProductBuildDirective,
  PRODUCT_BUILD_DIRECTIVE_CONTRACT,
  PRODUCT_BUILD_RECEIPT_CONTRACT,
  productBuildReceiptHash,
  validateProductBuildReceipt,
  type ProductBuildReceipt,
} from '../productBuildDirective.js';

const CROSS_REPO_FOUNDER_DECISION_HASH = '45a2b662e3d015dcf8482304198b1df804766ed583627992b9d1be2ee76d394d';
const CROSS_REPO_DIRECTIVE_HASH = '125d224d7aa29b657f0732d0bc209df9d94848708764a5a8e5d74d4e85100247';

const proposal: FounderControlProposalBinding = {
  proposalId: 'chief-storyengine-build-001',
  proposalHash: 'a'.repeat(64),
  projectSlug: 'l99',
  actionType: 'build-product-control-room-loop',
  expectedHeadSha: 'b'.repeat(40),
  capabilityPlanHash: 'c'.repeat(64),
};

function approvedDecision() {
  return createFounderControlDecision({ proposal, surface: 'fcr', decision: 'approved' });
}

function directive() {
  return createProductBuildDirective({
    directiveId: 'build-storyengine-001',
    founderDecision: approvedDecision(),
    proposal,
    productControlRoomId: 'storyengine-control-room',
    repository: 'jussray/StoryEngine',
    objective: 'Prove one bounded FCR to StoryEngine Control Room execution and receipt loop.',
    allowedCapabilities: ['founder-control-room-federation'],
    allowedMutationScope: ['control-room:event-log'],
    requiredProof: ['node-test', 'playwright'],
    stopConditions: ['one-successful-receipt', 'any-authority-drift'],
    rollback: 'Delete the single product-build audit event and revert the focused product-control-room adapter commit.',
  });
}

describe('product build directive contract', () => {
  it('turns exact Chief-bound founder approval into a narrow product Control Room directive', () => {
    const decision = approvedDecision();
    const value = directive();
    expect(value.contract).toBe(PRODUCT_BUILD_DIRECTIVE_CONTRACT);
    expect(decision.decisionHash).toBe(CROSS_REPO_FOUNDER_DECISION_HASH);
    expect(value.directiveHash).toBe(CROSS_REPO_DIRECTIVE_HASH);
    expect(value.proposal.capabilityPlanHash).toBe('c'.repeat(64));
    expect(value.proposal.expectedHeadSha).toBe('b'.repeat(40));
    expect(value.repository).toBe('jussray/StoryEngine');
    expect(value.productControlRoomId).toBe('storyengine-control-room');
    expect(value.authorityCeiling).toBe('reversible_product_change');
    expect(value.executionAuthorized).toBe(true);
    expect(value.receiptRequired).toBe(true);
    expect(value.mergeAuthorized).toBe(false);
    expect(value.deployAuthorized).toBe(false);
    expect(value.providerMutationAuthorized).toBe(false);
  });

  it('refuses to create a product directive without Chief capability-plan evidence', () => {
    const missingChief = { ...proposal, capabilityPlanHash: null };
    const decision = createFounderControlDecision({ proposal: missingChief, surface: 'fcr', decision: 'approved' });
    expect(() => createProductBuildDirective({
      directiveId: 'build-storyengine-001',
      founderDecision: decision,
      proposal: missingChief,
      productControlRoomId: 'storyengine-control-room',
      repository: 'jussray/StoryEngine',
      objective: 'should fail',
      allowedCapabilities: ['founder-control-room-federation'],
      allowedMutationScope: ['control-room:event-log'],
      requiredProof: ['playwright'],
      stopConditions: ['stop'],
      rollback: 'revert',
    })).toThrow('product build directives require a Chief capabilityPlanHash');
  });

  it('refuses rejected founder decisions even when the proposal is otherwise exact', () => {
    const rejected = createFounderControlDecision({ proposal, surface: 'fcr', decision: 'rejected' });
    expect(() => createProductBuildDirective({
      directiveId: 'build-storyengine-001',
      founderDecision: rejected,
      proposal,
      productControlRoomId: 'storyengine-control-room',
      repository: 'jussray/StoryEngine',
      objective: 'should fail',
      allowedCapabilities: ['founder-control-room-federation'],
      allowedMutationScope: ['control-room:event-log'],
      requiredProof: ['playwright'],
      stopConditions: ['stop'],
      rollback: 'revert',
    })).toThrow('exact founder approval is required before a product build directive can be created');
  });

  it('reconciles a product receipt only when it binds the exact directive and stays below the authority ceiling', () => {
    const buildDirective = directive();
    const withoutHash: Omit<ProductBuildReceipt, 'receiptHash'> = {
      contract: PRODUCT_BUILD_RECEIPT_CONTRACT,
      directiveHash: buildDirective.directiveHash,
      productControlRoomId: buildDirective.productControlRoomId,
      repository: buildDirective.repository,
      status: 'completed',
      changedResources: ['control-room:event-log'],
      proofRefs: ['node-test:productBuildControl', 'playwright:product-build-control'],
      executionReceiptId: 'storyengine-event-42',
      mergePerformed: false,
      deployPerformed: false,
      providerMutationPerformed: false,
    };
    const receipt: ProductBuildReceipt = { ...withoutHash, receiptHash: productBuildReceiptHash(withoutHash) };
    expect(validateProductBuildReceipt(receipt, buildDirective)).toEqual([]);

    expect(validateProductBuildReceipt({ ...receipt, repository: 'jussray/Sekret-Bip' }, buildDirective))
      .toContain('product build receipt repository mismatch');
    expect(validateProductBuildReceipt({ ...receipt, mergePerformed: true as false }, buildDirective))
      .toContain('product build receipt cannot claim merge authority');
  });
});
