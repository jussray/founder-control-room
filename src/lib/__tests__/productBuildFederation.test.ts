import { describe, expect, it } from 'vitest';
import {
  createFounderControlDecision,
  type FounderControlProposalBinding,
} from '../founderControlDecision.js';
import {
  createProductBuildDirective,
  productBuildReceiptHash,
  type ProductBuildReceipt,
} from '../productBuildDirective.js';
import {
  ProductBuildFederationError,
  dispatchStoryEngineProductBuildDirective,
} from '../productBuildFederation.js';

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

function receiptFor(directiveHash: string): ProductBuildReceipt {
  const withoutHash: Omit<ProductBuildReceipt, 'receiptHash'> = {
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
  return { ...withoutHash, receiptHash: productBuildReceiptHash(withoutHash) };
}

function response(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
  };
}

describe('StoryEngine product-build federation', () => {
  it('performs one exact-head request and reconciles the returned receipt', async () => {
    const buildDirective = directive();
    const calls: Array<{ url: string; init?: { method?: string; body?: string } }> = [];
    const results = [
      response({
        service: 'l99-story-engine', release_sha: HEAD, runtime_mode: 'test', state_backend: 'sqlite',
        persistence_contract: 'repo-local', started_at: STARTED_AT,
      }),
      response({ receipt: receiptFor(buildDirective.directiveHash) }),
      response({
        service: 'l99-story-engine', release_sha: HEAD, runtime_mode: 'test', state_backend: 'sqlite',
        persistence_contract: 'repo-local', started_at: STARTED_AT,
      }),
    ];
    const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, init });
      const next = results.shift();
      if (!next) throw new Error('unexpected fetch');
      return next;
    };

    const reconciled = await dispatchStoryEngineProductBuildDirective(buildDirective, {
      baseUrl: 'http://127.0.0.1:3901',
      apiKey: 'scoped-fcr-key',
      fetchImpl,
    });

    expect(reconciled.state).toBe('verified');
    expect(reconciled.exactHeadVerified).toBe(true);
    expect(reconciled.receiptVerified).toBe(true);
    expect(reconciled.receipt.changedResources).toEqual(['control-room:event-log']);
    expect(reconciled.mergePerformed).toBe(false);
    expect(reconciled.deployPerformed).toBe(false);
    expect(reconciled.providerMutationPerformed).toBe(false);
    expect(calls.map((call) => call.init?.method)).toEqual(['GET', 'POST', 'GET']);
    expect(calls[1]?.url).toBe('http://127.0.0.1:3901/api/control-room/product-build/execute');
  });

  it('blocks before the actuator when StoryEngine runtime identity is stale', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return response({
        service: 'l99-story-engine',
        release_sha: 'e'.repeat(40),
        runtime_mode: 'test',
        state_backend: 'sqlite',
        persistence_contract: 'repo-local',
        started_at: STARTED_AT,
      });
    };

    await expect(dispatchStoryEngineProductBuildDirective(directive(), {
      baseUrl: 'http://127.0.0.1:3901',
      apiKey: 'scoped-fcr-key',
      fetchImpl,
    })).rejects.toMatchObject<ProductBuildFederationError>({
      code: 'PRODUCT_BUILD_STALE_RUNTIME',
      mayHaveExecuted: false,
    });
    expect(calls).toHaveLength(1);
  });

  it('marks an ambiguous network failure as unknown and forbids blind retry semantics', async () => {
    const buildDirective = directive();
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      if (call === 1) {
        return response({
          service: 'l99-story-engine', release_sha: HEAD, runtime_mode: 'test', state_backend: 'sqlite',
          persistence_contract: 'repo-local', started_at: STARTED_AT,
        });
      }
      throw new Error('connection dropped after request');
    };

    await expect(dispatchStoryEngineProductBuildDirective(buildDirective, {
      baseUrl: 'http://127.0.0.1:3901',
      apiKey: 'scoped-fcr-key',
      fetchImpl,
    })).rejects.toMatchObject<ProductBuildFederationError>({
      code: 'PRODUCT_BUILD_EXECUTION_UNKNOWN',
      mayHaveExecuted: true,
    });
  });
});
