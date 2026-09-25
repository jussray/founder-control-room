import { describe, expect, it } from 'vitest';

import type { DomainAuthorityGrantV1 } from '../mediaRouterDomainProtocol.js';
import {
  InMemoryMediaAssetRegistry,
  InMemoryMediaBudgetReservationService,
  InMemoryMediaRevocationLedger,
  MEDIA_ATTACK_FLOW_IDS,
  canCompleteWithPostProduction,
  canonicalMediaJson,
  evaluateMediaRoute,
  mediaFingerprint,
  revokeMediaAsset,
  snapshotAllowance,
  snapshotBudget,
  validateMediaAttackFlowBundle,
  type AssetRegistryEntryV1,
  type MediaAttackFlowBundleV1,
  type MediaRouterDomainContextV1,
  type MediaRoutingRequestV1,
  type ProviderCatalogV1,
} from '../mediaRouter.js';

const at = '2026-09-24T03:00:00.000Z';

function passingAttackFlow(): MediaAttackFlowBundleV1 {
  return {
    version: 'media-attack-flow-v1',
    records: MEDIA_ATTACK_FLOW_IDS.map((flow, index) => ({
      flow,
      verdict: 'pass',
      sourceRecordIds: [`proof_${index}`],
      assertedAt: at,
      rationale: `${flow} passed against bounded evidence`,
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
    prompt: 'A bounded media request',
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

const authorityGrant: DomainAuthorityGrantV1 = {
  schema: 'fcr/media-domain-authority-grant@v1',
  kind: 'release',
  sourceProtocol: 'MAKEVIDEO',
  sourceRecordId: 'makevideo-release-1',
  assertedAt: at,
  approvalLevel: 'release_approved',
  authorityGranted: true,
};

function context(overrides: Partial<MediaRouterDomainContextV1> = {}): MediaRouterDomainContextV1 {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    intendedUse: 'internal_draft',
    releaseContext: { approvalRequiredBeforePublication: true },
    assetInputs: [],
    authorityGrants: [authorityGrant],
    ...overrides,
  };
}

const directCatalog: ProviderCatalogV1 = {
  version: 'catalog-1',
  observedAt: at,
  offers: [
    {
      providerId: 'google',
      modelId: 'nano-banana-test',
      kind: 'direct',
      capability: ['image.generate', 'image.edit', 'image.text_accuracy'],
      availability: 'enabled',
      pricingObservedAt: at,
      costModel: { unit: 'request', estimatedUsdPerUnit: 0.04 },
      freeAllowance: { source: 'api' },
      constraints: {
        supportsReferences: true,
        supportsExactText: true,
        supportsCommercialUse: true,
        qualityRank: 3,
        speedRank: 4,
      },
    },
  ],
};

function routeInput(req = request(), ctx = context(), catalog = directCatalog) {
  return {
    request: req,
    context: ctx,
    attackFlow: passingAttackFlow(),
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
  };
}

function asset(overrides: Partial<AssetRegistryEntryV1> = {}): AssetRegistryEntryV1 {
  return {
    assetId: 'asset-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    kind: 'video',
    status: 'candidate',
    mediaExecutionReceiptId: 'receipt-1',
    parentAssetIds: [],
    promptFingerprint: 'prompt-hash',
    referenceAssetIds: [],
    tags: [],
    lanes: [],
    rights: {
      commercialUseStatus: 'unknown',
      reusableAcrossProjects: false,
      reusableAcrossProjectsAuthorityRecordId: null,
      domainAuthorityGranted: false,
      domainAuthorityRecordId: null,
    },
    outcome: { shipped: false, published: false, conversionEvidenceIds: [] },
    createdAt: at,
    ...overrides,
  };
}

describe('media attack-flow gate', () => {
  it('requires every attack flow, including Attack Ten/20/3000/6000', () => {
    const bundle = passingAttackFlow();
    expect(validateMediaAttackFlowBundle(bundle)).toEqual([]);
    expect(MEDIA_ATTACK_FLOW_IDS).toContain('attack10');
    expect(MEDIA_ATTACK_FLOW_IDS).toContain('attack20');
    expect(MEDIA_ATTACK_FLOW_IDS).toContain('attack3000');
    expect(MEDIA_ATTACK_FLOW_IDS).toContain('attack6000');

    const missing = {
      ...bundle,
      records: bundle.records.filter((record) => record.flow !== 'attack10'),
    };
    expect(validateMediaAttackFlowBundle(missing)).toContain('attack flow attack10 must appear exactly once');
  });

  it('blocks execution when any attack flow blocks', () => {
    const input = routeInput();
    input.attackFlow.records = input.attackFlow.records.map((record) =>
      record.flow === 'redteam_post' ? { ...record, verdict: 'block' as const } : record,
    );
    const result = evaluateMediaRoute(input);
    expect(result.outcome).toMatchObject({ kind: 'BLOCKED', reason: 'POLICY_DENIED' });
  });
});

describe('deterministic post predicate', () => {
  it('routes composition to local post when all inputs are usable', () => {
    const req = request({
      type: 'post',
      intent: 'compose',
      goal: 'final',
      referenceAssetIds: ['asset-1'],
      referencePolicy: {
        maySendToExternalProvider: false,
        mayStoreInLibrary: true,
        mayReuseCrossProject: false,
      },
    });
    expect(canCompleteWithPostProduction(req, [asset()])).toEqual({ ok: true });

    const input = routeInput(req);
    input.availableAssets = [asset()];
    const result = evaluateMediaRoute(input);
    expect(result.outcome).toMatchObject({ kind: 'DETERMINISTIC_POST', tool: 'ffmpeg' });
    expect(result.estimatedCost.generativeProviderUsd).toBe(0);
  });

  it('never treats a generative edit as deterministic post', () => {
    const req = request({ type: 'image', intent: 'edit', referenceAssetIds: ['asset-1'] });
    expect(canCompleteWithPostProduction(req, [asset({ kind: 'image' })])).toEqual({
      ok: false,
      reason: 'INTENT_NOT_POST_PRODUCIBLE',
    });
  });

  it('rejects revoked inputs', () => {
    const req = request({ type: 'post', intent: 'assemble', referenceAssetIds: ['asset-1'] });
    expect(canCompleteWithPostProduction(req, [asset({ status: 'revoked' })])).toEqual({
      ok: false,
      reason: 'POST_INPUTS_MISSING',
    });
  });
});

describe('route evaluator', () => {
  it('selects an under-budget direct route', () => {
    const result = evaluateMediaRoute(routeInput());
    expect(result.outcome).toMatchObject({
      kind: 'DIRECT_PROVIDER',
      providerId: 'google',
      modelId: 'nano-banana-test',
    });
    expect(result.estimatedCost.generativeProviderUsd).toBe(0.04);
  });

  it('uses a verified API free allowance before paid cost', () => {
    const input = routeInput(request({
      budget: { mode: 'free', maxCostUsd: 0, allowWrapper: false, requireDirectProviderWhenAvailable: true },
    }));
    input.allowance = snapshotAllowance({
      entries: [{ providerId: 'google', modelId: 'nano-banana-test', balance: 1, source: 'api' }],
    });
    const result = evaluateMediaRoute(input);
    expect(result.outcome.kind).toBe('DIRECT_PROVIDER');
    expect(result.decisionFactors.freeAllowanceUsed).toBe(true);
    expect(result.estimatedCost.generativeProviderUsd).toBe(0);
  });

  it('blocks free mode when the allowance is not verified by API', () => {
    const input = routeInput(request({
      budget: { mode: 'free', maxCostUsd: 0, allowWrapper: false, requireDirectProviderWhenAvailable: true },
    }));
    input.allowance = snapshotAllowance({
      entries: [{ providerId: 'google', modelId: 'nano-banana-test', balance: 10, source: 'manual' }],
    });
    expect(evaluateMediaRoute(input).outcome).toMatchObject({
      kind: 'BLOCKED',
      reason: 'NO_ELIGIBLE_FREE_ROUTE',
    });
  });

  it('enforces per-reference external-provider policy before provider selection', () => {
    const req = request({ referenceAssetIds: ['identity-1'] });
    const ctx = context({
      assetInputs: [{
        assetId: 'identity-1',
        role: 'identity_reference',
        maySendToExternalProvider: false,
        domainApprovalSourceRecordId: 'makevideo-release-1',
      }],
    });
    expect(evaluateMediaRoute(routeInput(req, ctx)).outcome).toMatchObject({
      kind: 'BLOCKED',
      reason: 'REFERENCE_NOT_APPROVED',
    });
  });

  it('does not let the router become a publication executor even when domain authority is true', () => {
    const req = request({ authority: { action: 'media.publish', approvalReceiptId: 'makevideo-release-1' } });
    expect(evaluateMediaRoute(routeInput(req)).outcome).toMatchObject({
      kind: 'BLOCKED',
      reason: 'POLICY_DENIED',
    });
  });

  it('blocks wrappers in Phase 1 instead of pretending wrapper value is verified', () => {
    const catalog: ProviderCatalogV1 = {
      version: 'wrapper-only',
      observedAt: at,
      offers: [{
        providerId: 'wrapper',
        modelId: 'same-model',
        kind: 'wrapper',
        capability: ['image.generate'],
        availability: 'enabled',
        pricingObservedAt: at,
        costModel: { unit: 'request', estimatedUsdPerUnit: 0.2 },
        freeAllowance: { source: 'unknown' },
        constraints: { supportsReferences: true, supportsCommercialUse: true },
      }],
    };
    expect(evaluateMediaRoute(routeInput(request(), context(), catalog)).outcome).toMatchObject({
      kind: 'BLOCKED',
      reason: 'WRAPPER_NOT_JUSTIFIED',
    });
  });

  it('honors global daily/monthly budget headroom', () => {
    const input = routeInput();
    input.budget = snapshotBudget({
      dailyCapUsd: 0.03,
      monthlyCapUsd: 100,
      spentTodayUsd: 0,
      spentThisMonthUsd: 0,
      activeReservationsUsd: 0,
    });
    expect(evaluateMediaRoute(input).outcome).toMatchObject({ kind: 'BLOCKED', reason: 'OVER_BUDGET' });
  });
});

describe('fingerprints', () => {
  it('canonicalizes object key order and reacts to attack evidence changes', () => {
    expect(canonicalMediaJson({ b: 2, a: 1 })).toBe(canonicalMediaJson({ a: 1, b: 2 }));
    const first = passingAttackFlow();
    const second = passingAttackFlow();
    second.records[0] = { ...second.records[0], sourceRecordIds: ['different-proof'] };
    expect(mediaFingerprint(first)).not.toBe(mediaFingerprint(second));
  });
});

describe('budget reservation and revocation', () => {
  it('reserves atomically against the configured cap', async () => {
    const service = new InMemoryMediaBudgetReservationService({ dailyCapUsd: 1, monthlyCapUsd: 2 });
    expect((await service.reserve({ requestId: 'r1', amountUsd: 0.8 })).ok).toBe(true);
    expect(await service.reserve({ requestId: 'r2', amountUsd: 0.3 })).toEqual({ ok: false, reason: 'EXCEEDS_DAILY' });
  });

  it('appends revocation evidence and makes revoked status terminal', async () => {
    const registry = new InMemoryMediaAssetRegistry();
    const ledger = new InMemoryMediaRevocationLedger();
    await registry.put(asset());
    await revokeMediaAsset({
      registry,
      ledger,
      revocation: {
        id: 'rev-1',
        assetId: 'asset-1',
        revokedAt: at,
        reason: 'RIGHTS_CHANGED',
        revokedBy: 'founder-1',
        authorityRecordId: 'makevideo-release-1',
        notes: null,
        downstreamUses: [],
      },
    });
    expect((await registry.get('asset-1'))?.status).toBe('revoked');
    expect(await ledger.listByAsset('asset-1')).toHaveLength(1);
    await expect(registry.updateStatus('asset-1', 'candidate')).rejects.toThrow(/cannot be reactivated/);
  });
});
