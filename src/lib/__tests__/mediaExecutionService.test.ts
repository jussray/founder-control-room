import { describe, expect, it } from 'vitest';

import {
  InMemoryMediaReceiptLedger,
  MEDIA_ATTACK_FLOW_IDS,
  mediaFounderSkillBundle,
  snapshotAllowance,
  snapshotBudget,
  type AssetRegistryEntryV1,
  type MediaAttackFlowBundleV1,
  type MediaRouterDomainContextV1,
  type MediaRoutingRequestV1,
  type ProviderCatalogV1,
} from '../mediaRouter.js';
import {
  DryRunMediaExecutionService,
  MEDIA_EXECUTION_SERVICE_VERSION,
} from '../mediaExecutionService.js';

const at = '2026-11-01T18:30:00.000Z';

function attackFlow(): MediaAttackFlowBundleV1 {
  return {
    version: 'media-attack-flow-v1',
    founderSkills: mediaFounderSkillBundle(at),
    records: MEDIA_ATTACK_FLOW_IDS.map((flow, index) => ({
      flow,
      verdict: 'pass',
      sourceRecordIds: [`proof_${index}`],
      assertedAt: at,
      rationale: `${flow} passed`,
    })),
  };
}

function request(overrides: Partial<MediaRoutingRequestV1> = {}): MediaRoutingRequestV1 {
  return {
    requestId: 'request-1',
    correlationId: 'corr-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    requestedBy: 'founder-1',
    type: 'image',
    intent: 'generate',
    goal: 'draft',
    prompt: 'Create a bounded draft image',
    referenceAssetIds: [],
    referencePolicy: {
      maySendToExternalProvider: true,
      mayStoreInLibrary: true,
      mayReuseCrossProject: false,
    },
    output: {},
    constraints: {},
    budget: {
      mode: 'cheap',
      maxCostUsd: 1,
      allowWrapper: false,
      requireDirectProviderWhenAvailable: true,
    },
    authority: { action: 'media.generate' },
    ...overrides,
  };
}

function context(overrides: Partial<MediaRouterDomainContextV1> = {}): MediaRouterDomainContextV1 {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    intendedUse: 'internal_draft',
    releaseContext: { approvalRequiredBeforePublication: true },
    assetInputs: [],
    authorityGrants: [],
    ...overrides,
  };
}

const catalog: ProviderCatalogV1 = {
  version: 'catalog-1',
  observedAt: at,
  offers: [{
    providerId: 'google',
    modelId: 'image-test',
    kind: 'direct',
    capability: ['image.generate'],
    availability: 'enabled',
    pricingObservedAt: at,
    costModel: { unit: 'request', estimatedUsdPerUnit: 0.04 },
    freeAllowance: { source: 'api' },
    constraints: {
      supportsReferences: true,
      supportsCommercialUse: true,
      qualityRank: 3,
      speedRank: 3,
    },
  }],
};

function service(ledger = new InMemoryMediaReceiptLedger()) {
  return {
    ledger,
    instance: new DryRunMediaExecutionService({
      attackFlow: attackFlow(),
      catalog,
      allowance: snapshotAllowance({ entries: [] }),
      budget: snapshotBudget({
        dailyCapUsd: 10,
        monthlyCapUsd: 100,
        spentTodayUsd: 0,
        spentThisMonthUsd: 0,
        activeReservationsUsd: 0,
      }),
      availableAssets: [] as AssetRegistryEntryV1[],
    }, ledger, () => at),
  };
}

describe('DryRunMediaExecutionService', () => {
  it('returns a recommendation without writing a receipt or reserving execution state', async () => {
    const { instance, ledger } = service();
    const result = await instance.execute({
      request: request(),
      context: context(),
      mode: 'dry_run',
      idempotencyKey: 'dry-run-1',
    });

    expect(result.kind).toBe('RECOMMENDED');
    expect(result.recommendation.outcome).toMatchObject({
      kind: 'DIRECT_PROVIDER',
      providerId: 'google',
      modelId: 'image-test',
    });
    expect(await ledger.listByRequest('request-1')).toEqual([]);
  });

  it('keeps publication outside the router and records a blocked planning receipt in execute mode', async () => {
    const { instance, ledger } = service();
    const result = await instance.execute({
      request: request({ authority: { action: 'media.publish' } }),
      context: context(),
      mode: 'execute',
      idempotencyKey: 'publish-attempt-1',
    });

    expect(result.kind).toBe('BLOCKED');
    if (result.kind !== 'BLOCKED') throw new Error('expected blocked result');
    expect(result.recommendation.outcome).toMatchObject({ kind: 'BLOCKED', reason: 'POLICY_DENIED' });
    expect(result.receipt.status).toBe('BLOCKED');
    expect(result.receipt.executionKind).toBe('NONE');
    expect(result.receipt.output.assetIds).toEqual([]);
    expect(result.receipt.cost.reserved.totalUsd).toBe(0);
    expect(result.receipt.selectedRoute.adapterVersion).toBe(MEDIA_EXECUTION_SERVICE_VERSION);
    expect(await ledger.listByRequest('request-1')).toHaveLength(1);
  });

  it('fails closed when execute is requested for an otherwise eligible provider route', async () => {
    const { instance } = service();
    const result = await instance.execute({
      request: request(),
      context: context(),
      mode: 'execute',
      idempotencyKey: 'execute-not-enabled-1',
    });

    expect(result.kind).toBe('BLOCKED');
    if (result.kind !== 'BLOCKED') throw new Error('expected blocked result');
    expect(result.recommendation.outcome.kind).toBe('DIRECT_PROVIDER');
    expect(result.receipt.failure?.code).toBe('EXECUTION_NOT_ENABLED');
    expect(result.receipt.output.providerTaskId).toBeNull();
    expect(result.receipt.output.assetIds).toEqual([]);
    expect(result.receipt.cost.reserved.reservationId).toBeNull();
    expect(result.receipt.recommendationFingerprint).toBe(result.recommendation.fingerprint);
  });

  it('is receipt-idempotent for retries with the same request and idempotency key', async () => {
    const { instance, ledger } = service();
    const input = {
      request: request(),
      context: context(),
      mode: 'execute' as const,
      idempotencyKey: 'same-attempt',
    };

    const first = await instance.execute(input);
    const second = await instance.execute(input);
    expect(first.kind).toBe('BLOCKED');
    expect(second.kind).toBe('BLOCKED');
    if (first.kind !== 'BLOCKED' || second.kind !== 'BLOCKED') throw new Error('expected blocked results');
    expect(second.receipt.receiptId).toBe(first.receipt.receiptId);
    expect(second.receipt.receiptFingerprint).toBe(first.receipt.receiptFingerprint);
    expect(await ledger.listByRequest('request-1')).toHaveLength(1);
  });

  it('rejects an empty idempotency key before producing any receipt', async () => {
    const { instance, ledger } = service();
    await expect(instance.execute({
      request: request(),
      context: context(),
      mode: 'execute',
      idempotencyKey: '   ',
    })).rejects.toThrow(/idempotencyKey/);
    expect(await ledger.listByRequest('request-1')).toEqual([]);
  });
});
