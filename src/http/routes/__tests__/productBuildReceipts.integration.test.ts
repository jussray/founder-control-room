import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createFounderControlDecision,
  type FounderControlProposalBinding,
} from '../../../lib/founderControlDecision.js';
import {
  createProductBuildDirective,
  productBuildReceiptHash,
  type ProductBuildReceipt,
} from '../../../lib/productBuildDirective.js';
import {
  createProductBuildReceiptIngestHandler,
  deriveStoryEngineProductBuildReceiptToken,
} from '../productBuildReceipts.js';

const ROOT = 'test-only-product-build-receipt-root-token';
const HEAD = 'b'.repeat(40);
const STARTED_AT = '2026-09-04T16:00:00.000Z';

function directive() {
  const proposal: FounderControlProposalBinding = {
    proposalId: 'chief-storyengine-build-001',
    proposalHash: 'a'.repeat(64),
    projectSlug: 'l99',
    actionType: 'build-product-control-room-loop',
    expectedHeadSha: HEAD,
    capabilityPlanHash: 'c'.repeat(64),
  };
  const founderDecision = createFounderControlDecision({ proposal, surface: 'fcr', decision: 'approved' });
  return createProductBuildDirective({
    directiveId: 'build-storyengine-001',
    founderDecision,
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

function receipt(directiveHash: string): ProductBuildReceipt {
  const value: Omit<ProductBuildReceipt, 'receiptHash'> = {
    contract: 'juss-v10/product-build-receipt@v1',
    directiveHash,
    productControlRoomId: 'storyengine-control-room',
    repository: 'jussray/StoryEngine',
    status: 'completed',
    changedResources: ['control-room:event-log'],
    proofRefs: ['storyengine:event-log:42'],
    executionReceiptId: '42',
    mergePerformed: false,
    deployPerformed: false,
    providerMutationPerformed: false,
  };
  return { ...value, receiptHash: productBuildReceiptHash(value) };
}

function runtime() {
  return {
    service: 'l99-story-engine',
    release_sha: HEAD,
    runtime_mode: 'test',
    state_backend: 'sqlite',
    persistence_contract: 'repo-local',
    started_at: STARTED_AT,
  };
}

function buildApp(rootToken = ROOT) {
  const app = express();
  app.use(express.json());
  app.post('/ingest', createProductBuildReceiptIngestHandler({
    FCR_PRODUCT_BUILD_RECEIPT_ROOT_TOKEN: rootToken,
  }));
  return app;
}

describe('StoryEngine product-build receipt ingress', () => {
  it('rejects callers that do not hold the derived service token', async () => {
    const response = await request(buildApp())
      .post('/ingest')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('PRODUCT_BUILD_RECEIPT_TOKEN_INVALID');
  });

  it('reconciles an exact directive/receipt/runtime identity packet without granting extra authority', async () => {
    const buildDirective = directive();
    const buildReceipt = receipt(buildDirective.directiveHash);
    const response = await request(buildApp())
      .post('/ingest')
      .set('x-product-build-receipt-token', deriveStoryEngineProductBuildReceiptToken(ROOT))
      .send({
        directive: buildDirective,
        receipt: buildReceipt,
        runtimeIdentityBefore: runtime(),
        runtimeIdentityAfter: runtime(),
      });

    expect(response.status).toBe(202);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      ok: true,
      accepted: true,
      reconciled: true,
      evidenceState: 'verified-in-request',
      durablePersistencePerformed: false,
      replayProtectionPerformed: false,
      mergeAuthorized: false,
      deployAuthorized: false,
      providerMutationAuthorized: false,
      reconciliation: {
        state: 'verified',
        exactHeadVerified: true,
        serviceIdentityVerified: true,
        receiptVerified: true,
      },
    });
  });

  it('rejects a receipt packet when the runtime moved after execution', async () => {
    const buildDirective = directive();
    const buildReceipt = receipt(buildDirective.directiveHash);
    const response = await request(buildApp())
      .post('/ingest')
      .set('x-product-build-receipt-token', deriveStoryEngineProductBuildReceiptToken(ROOT))
      .send({
        directive: buildDirective,
        receipt: buildReceipt,
        runtimeIdentityBefore: runtime(),
        runtimeIdentityAfter: { ...runtime(), started_at: '2026-09-04T16:01:00.000Z' },
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PRODUCT_BUILD_RECEIPT_RECONCILIATION_FAILED');
    expect(response.body.reasons.join(' ')).toContain('runtime changed during product-build execution');
  });
});
