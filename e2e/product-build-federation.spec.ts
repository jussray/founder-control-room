import type { Server } from 'node:http';
import express from 'express';
import { expect, test } from '@playwright/test';
import {
  createFounderControlDecision,
  type FounderControlProposalBinding,
} from '../src/lib/founderControlDecision.js';
import { createProductBuildDirective } from '../src/lib/productBuildDirective.js';
import { dispatchStoryEngineProductBuildDirective } from '../src/lib/productBuildFederation.js';
import {
  createProductBuildReceiptIngestHandler,
  deriveStoryEngineProductBuildReceiptToken,
} from '../src/http/routes/productBuildReceipts.js';

const peerUrl = process.env.STORYENGINE_PEER_URL ?? 'http://127.0.0.1:3901';
const peerSha = process.env.STORYENGINE_PEER_SHA ?? '';
const peerApiKey = process.env.STORYENGINE_PEER_API_KEY ?? '';
const receiptRoot = 'playwright-local-product-build-receipt-root';

let receiptServer: Server;
let receiptOrigin = '';

test.beforeAll(async () => {
  expect(peerSha).toMatch(/^[0-9a-f]{40}$/);
  expect(peerApiKey.length).toBeGreaterThan(0);

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.post('/ingest/product-build-receipts/storyengine', createProductBuildReceiptIngestHandler({
    FCR_PRODUCT_BUILD_RECEIPT_ROOT_TOKEN: receiptRoot,
  }));

  await new Promise<void>((resolve, reject) => {
    receiptServer = app.listen(0, '127.0.0.1', () => resolve());
    receiptServer.once('error', reject);
  });
  const address = receiptServer.address();
  if (!address || typeof address === 'string') throw new Error('FCR receipt proof server did not bind a TCP port');
  receiptOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!receiptServer) return;
  await new Promise<void>((resolve, reject) => receiptServer.close((error) => error ? reject(error) : resolve()));
});

function directive() {
  const proposal: FounderControlProposalBinding = {
    proposalId: 'chief-storyengine-playwright-lap-001',
    proposalHash: 'a'.repeat(64),
    projectSlug: 'l99',
    actionType: 'build-product-control-room-loop',
    expectedHeadSha: peerSha,
    capabilityPlanHash: 'c'.repeat(64),
  };
  const founderDecision = createFounderControlDecision({
    proposal,
    surface: 'fcr',
    decision: 'approved',
  });
  return createProductBuildDirective({
    directiveId: 'playwright-storyengine-lap-001',
    founderDecision,
    proposal,
    productControlRoomId: 'storyengine-control-room',
    repository: 'jussray/StoryEngine',
    objective: 'Prove one real exact-head FCR to StoryEngine Control Room HTTP execution and receipt return lap.',
    allowedCapabilities: ['founder-control-room-federation'],
    allowedMutationScope: ['control-room:event-log'],
    requiredProof: ['playwright', 'exact-head-runtime-identity'],
    stopConditions: ['one-successful-receipt', 'any-authority-drift'],
    rollback: 'Delete the single local proof audit event and revert the focused federation adapter changes.',
  });
}

test('FCR drives exact StoryEngine runtime and reconciles its receipt through the service ingress', async ({ page, request }) => {
  const identityResponse = await page.goto(`${peerUrl}/runtime-identity`);
  expect(identityResponse?.status()).toBe(200);
  const browserIdentity = await identityResponse?.json() as { service?: string; release_sha?: string };
  expect(browserIdentity.service).toBe('l99-story-engine');
  expect(browserIdentity.release_sha).toBe(peerSha);

  const buildDirective = directive();
  const reconciliation = await dispatchStoryEngineProductBuildDirective(buildDirective, {
    baseUrl: peerUrl,
    apiKey: peerApiKey,
  });

  expect(reconciliation.state).toBe('verified');
  expect(reconciliation.runtimeIdentityBefore.release_sha).toBe(peerSha);
  expect(reconciliation.runtimeIdentityAfter.release_sha).toBe(peerSha);
  expect(reconciliation.receipt.status).toBe('completed');
  expect(reconciliation.receipt.changedResources).toEqual(['control-room:event-log']);
  expect(reconciliation.receipt.mergePerformed).toBe(false);
  expect(reconciliation.receipt.deployPerformed).toBe(false);
  expect(reconciliation.receipt.providerMutationPerformed).toBe(false);

  const ingress = await request.post(`${receiptOrigin}/ingest/product-build-receipts/storyengine`, {
    headers: {
      'x-product-build-receipt-token': deriveStoryEngineProductBuildReceiptToken(receiptRoot),
    },
    data: {
      directive: buildDirective,
      receipt: reconciliation.receipt,
      runtimeIdentityBefore: reconciliation.runtimeIdentityBefore,
      runtimeIdentityAfter: reconciliation.runtimeIdentityAfter,
    },
  });

  expect(ingress.status()).toBe(202);
  const accepted = await ingress.json();
  expect(accepted).toMatchObject({
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
