import {
  evaluateMediaRoute,
  mediaFingerprint,
  type AllowanceSnapshotV1,
  type AssetRegistryEntryV1,
  type BudgetSnapshotV1,
  type MediaAttackFlowBundleV1,
  type MediaRouteRecommendationV1,
  type MediaRouterDomainContextV1,
  type MediaRoutingRequestV1,
  type ProviderCatalogV1,
} from './mediaRouter.js';
import {
  assertMediaExecutionReceiptV1,
  type CostLedgerV1,
  type MediaExecutionReceiptV1,
} from './mediaRouterPhase1Contracts.js';

export const MEDIA_EXECUTION_SERVICE_VERSION = 'fcr/media-execution-service@v1' as const;

export interface MediaExecutionReceiptLedgerV1 {
  append(receipt: MediaExecutionReceiptV1): Promise<void>;
  get(receiptId: string): Promise<MediaExecutionReceiptV1 | null>;
  listByRequest(requestId: string): Promise<MediaExecutionReceiptV1[]>;
}

export interface MediaExecutionServiceStateV1 {
  attackFlow: MediaAttackFlowBundleV1;
  catalog: ProviderCatalogV1;
  allowance: AllowanceSnapshotV1;
  budget: BudgetSnapshotV1;
  availableAssets: AssetRegistryEntryV1[];
}

export interface MediaExecutionServiceInputV1 {
  request: MediaRoutingRequestV1;
  context: MediaRouterDomainContextV1;
  mode: 'dry_run' | 'execute';
  idempotencyKey: string;
}

export type MediaExecutionServiceResultV1 =
  | { kind: 'RECOMMENDED'; recommendation: MediaRouteRecommendationV1 }
  | { kind: 'BLOCKED'; recommendation: MediaRouteRecommendationV1; receipt: MediaExecutionReceiptV1 }
  | { kind: 'INTERACTIVE_HUMAN'; recommendation: MediaRouteRecommendationV1; receipt: MediaExecutionReceiptV1 }
  | { kind: 'EXECUTED'; recommendation: MediaRouteRecommendationV1; receipt: MediaExecutionReceiptV1; output: never }
  | { kind: 'FAILED'; recommendation: MediaRouteRecommendationV1; receipt: MediaExecutionReceiptV1 };

export interface MediaExecutionService {
  execute(input: MediaExecutionServiceInputV1): Promise<MediaExecutionServiceResultV1>;
}

function estimatedCostLedger(recommendation: MediaRouteRecommendationV1): CostLedgerV1 {
  return {
    currency: 'USD',
    estimated: {
      generativeProviderUsd: recommendation.estimatedCost.generativeProviderUsd,
      deterministicComputeUsd: recommendation.estimatedCost.deterministicComputeUsd,
      storageAndEgressUsd: recommendation.estimatedCost.storageAndEgressUsd,
      humanLaborUsd: null,
      totalUsd: recommendation.estimatedCost.totalUsd,
    },
    reserved: {
      generativeProviderUsd: 0,
      deterministicComputeUsd: 0,
      totalUsd: 0,
      reservationId: null,
    },
    actual: {
      generativeProviderUsd: null,
      deterministicComputeUsd: null,
      storageAndEgressUsd: null,
      humanLaborUsd: null,
      totalUsd: null,
    },
    usage: {
      providerCreditsSpent: null,
      inputTokens: null,
      outputTokens: null,
      generatedSeconds: null,
      renderCpuSeconds: null,
      renderGpuSeconds: null,
      storageBytesAdded: null,
      egressBytes: null,
    },
    accountingStatus: 'estimated',
  };
}

function executionKind(recommendation: MediaRouteRecommendationV1): MediaExecutionReceiptV1['executionKind'] {
  switch (recommendation.outcome.kind) {
    case 'DETERMINISTIC_POST':
    case 'DIRECT_PROVIDER':
    case 'WRAPPER':
    case 'INTERACTIVE_HUMAN':
      return recommendation.outcome.kind;
    case 'BLOCKED':
      return 'NONE';
  }
}

function selectedRoute(recommendation: MediaRouteRecommendationV1): MediaExecutionReceiptV1['selectedRoute'] {
  const base = {
    adapterVersion: MEDIA_EXECUTION_SERVICE_VERSION,
    routePolicyVersion: recommendation.policyVersion,
    providerCatalogVersion: recommendation.providerCatalogVersion,
  };
  if (recommendation.outcome.kind === 'DIRECT_PROVIDER') {
    return {
      ...base,
      providerId: recommendation.outcome.providerId,
      modelId: recommendation.outcome.modelId,
      providerOfferFingerprint: recommendation.outcome.providerOfferFingerprint,
    };
  }
  if (recommendation.outcome.kind === 'WRAPPER') {
    return {
      ...base,
      providerId: recommendation.outcome.providerId,
      providerOfferFingerprint: recommendation.outcome.providerOfferFingerprint,
    };
  }
  return base;
}

export class DryRunMediaExecutionService implements MediaExecutionService {
  constructor(
    private readonly state: MediaExecutionServiceStateV1,
    private readonly receiptLedger: MediaExecutionReceiptLedgerV1,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async execute(input: MediaExecutionServiceInputV1): Promise<MediaExecutionServiceResultV1> {
    if (!input.idempotencyKey.trim()) throw new Error('idempotencyKey is required');

    const recommendation = evaluateMediaRoute({
      request: input.request,
      context: input.context,
      attackFlow: this.state.attackFlow,
      catalog: this.state.catalog,
      allowance: this.state.allowance,
      budget: this.state.budget,
      availableAssets: this.state.availableAssets,
    });

    if (input.mode === 'dry_run') {
      return { kind: 'RECOMMENDED', recommendation };
    }

    const receiptId = `media_exec_${mediaFingerprint({
      requestId: input.request.requestId,
      idempotencyKey: input.idempotencyKey,
      recommendationFingerprint: recommendation.fingerprint,
      serviceVersion: MEDIA_EXECUTION_SERVICE_VERSION,
    }).slice(0, 24)}`;

    const existing = await this.receiptLedger.get(receiptId);
    if (existing) return this.resultFromReceipt(recommendation, existing);

    const timestamp = this.now();
    if (!Number.isFinite(Date.parse(timestamp))) throw new Error('clock returned an invalid timestamp');

    let safeMessage: string;
    let failureCode: string;
    let rejectedRoutes: MediaExecutionReceiptV1['rejectedRoutes'];

    switch (recommendation.outcome.kind) {
      case 'BLOCKED':
        safeMessage = recommendation.outcome.safeMessage;
        failureCode = recommendation.outcome.reason;
        rejectedRoutes = [{ providerId: 'none', reason: recommendation.outcome.reason }];
        break;
      case 'INTERACTIVE_HUMAN':
        safeMessage = recommendation.outcome.reason;
        failureCode = 'INTERACTIVE_HUMAN_REQUIRED';
        rejectedRoutes = [];
        break;
      default:
        safeMessage = 'Execution adapters are not enabled in the dry-run orchestrator. Recommendation recorded without reservation, provider call, asset creation, or publication.';
        failureCode = 'EXECUTION_NOT_ENABLED';
        rejectedRoutes = [];
        break;
    }

    const receiptWithoutFingerprint: Omit<MediaExecutionReceiptV1, 'receiptFingerprint'> = {
      receiptId,
      correlationId: input.request.correlationId,
      workspaceId: input.request.workspaceId,
      projectId: input.request.projectId,
      requestId: input.request.requestId,
      routeRecommendationId: recommendation.recommendationId,
      status: 'BLOCKED',
      executionKind: executionKind(recommendation),
      task: {
        type: input.request.type,
        intent: input.request.intent,
        goal: input.request.goal,
        promptFingerprint: mediaFingerprint({
          prompt: input.request.prompt,
          negativePrompt: input.request.negativePrompt ?? null,
        }),
        referenceAssetIds: [...input.request.referenceAssetIds],
      },
      selectedRoute: selectedRoute(recommendation),
      rejectedRoutes,
      cost: estimatedCostLedger(recommendation),
      output: {
        assetIds: [],
        outputFingerprint: null,
        providerTaskId: null,
      },
      timings: {
        requestedAt: timestamp,
        startedAt: null,
        completedAt: timestamp,
      },
      failure: {
        code: failureCode,
        safeMessage,
        retryable: false,
      },
      nextBestStep: safeMessage,
      retryPath: null,
      rollbackPath: null,
      recommendationFingerprint: recommendation.fingerprint,
    };

    const receipt = assertMediaExecutionReceiptV1({
      ...receiptWithoutFingerprint,
      receiptFingerprint: mediaFingerprint(receiptWithoutFingerprint),
    });
    await this.receiptLedger.append(receipt);
    return this.resultFromReceipt(recommendation, receipt);
  }

  private resultFromReceipt(
    recommendation: MediaRouteRecommendationV1,
    receipt: MediaExecutionReceiptV1,
  ): MediaExecutionServiceResultV1 {
    if (recommendation.outcome.kind === 'INTERACTIVE_HUMAN') {
      return { kind: 'INTERACTIVE_HUMAN', recommendation, receipt };
    }
    return { kind: 'BLOCKED', recommendation, receipt };
  }
}
