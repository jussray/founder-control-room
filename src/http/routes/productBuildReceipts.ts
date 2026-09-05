import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  validateProductBuildDirective,
  type ProductBuildDirective,
  type ProductBuildReceipt,
} from '../../lib/productBuildDirective.js';
import {
  ProductBuildFederationError,
  reconcileStoryEngineProductBuild,
  type StoryEngineRuntimeIdentity,
} from '../../lib/productBuildFederation.js';

export const PRODUCT_BUILD_RECEIPT_INGRESS_CONTRACT = 'founder-control-room/product-build-receipt-ingress@v1' as const;
export const STORYENGINE_PRODUCT_BUILD_RECEIPT_CONTEXT =
  'founder-control-room/product-build-receipts/v1:storyengine-control-room:jussray/StoryEngine' as const;

const TOKEN_HEADER = 'x-product-build-receipt-token';
const FULL_SHA = /^[0-9a-f]{40}$/i;

type JsonRecord = Record<string, unknown>;

export interface ProductBuildReceiptIngressEnv {
  FCR_PRODUCT_BUILD_RECEIPT_ROOT_TOKEN?: string;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function deriveStoryEngineProductBuildReceiptToken(rootToken: string): string {
  const root = rootToken.trim();
  if (!root) throw new Error('FCR product-build receipt root token is required');
  return createHmac('sha256', root).update(STORYENGINE_PRODUCT_BUILD_RECEIPT_CONTEXT).digest('base64url');
}

function runtimeIdentity(value: unknown): StoryEngineRuntimeIdentity | null {
  const candidate = record(value);
  if (!candidate) return null;
  const service = text(candidate.service);
  const releaseSha = text(candidate.release_sha).toLowerCase();
  const startedAt = text(candidate.started_at);
  if (service !== 'l99-story-engine' || !FULL_SHA.test(releaseSha) || !startedAt) return null;
  return {
    service: 'l99-story-engine',
    release_sha: releaseSha,
    runtime_mode: text(candidate.runtime_mode),
    state_backend: text(candidate.state_backend),
    persistence_contract: text(candidate.persistence_contract),
    started_at: startedAt,
  };
}

export function createProductBuildReceiptIngestHandler(env: ProductBuildReceiptIngressEnv = process.env) {
  return (req: Request, res: Response) => {
    const rootToken = env.FCR_PRODUCT_BUILD_RECEIPT_ROOT_TOKEN?.trim() ?? '';
    if (!rootToken) {
      return res.status(503).json({
        ok: false,
        contract: PRODUCT_BUILD_RECEIPT_INGRESS_CONTRACT,
        code: 'PRODUCT_BUILD_RECEIPT_INGRESS_NOT_CONFIGURED',
      });
    }

    const supplied = req.get(TOKEN_HEADER)?.trim() ?? '';
    const expected = deriveStoryEngineProductBuildReceiptToken(rootToken);
    if (!supplied || !safeEqual(supplied, expected)) {
      return res.status(401).json({
        ok: false,
        contract: PRODUCT_BUILD_RECEIPT_INGRESS_CONTRACT,
        code: 'PRODUCT_BUILD_RECEIPT_TOKEN_INVALID',
      });
    }

    const body = record(req.body);
    const directiveRecord = record(body?.directive);
    const receiptRecord = record(body?.receipt);
    const runtimeIdentityBefore = runtimeIdentity(body?.runtimeIdentityBefore);
    const runtimeIdentityAfter = runtimeIdentity(body?.runtimeIdentityAfter);
    if (!directiveRecord || !receiptRecord || !runtimeIdentityBefore || !runtimeIdentityAfter) {
      return res.status(400).json({
        ok: false,
        contract: PRODUCT_BUILD_RECEIPT_INGRESS_CONTRACT,
        code: 'PRODUCT_BUILD_RECEIPT_PAYLOAD_INVALID',
      });
    }

    const directiveErrors = validateProductBuildDirective(directiveRecord);
    if (directiveErrors.length > 0) {
      return res.status(400).json({
        ok: false,
        contract: PRODUCT_BUILD_RECEIPT_INGRESS_CONTRACT,
        code: 'PRODUCT_BUILD_DIRECTIVE_INVALID',
        reasons: directiveErrors,
      });
    }

    try {
      const reconciliation = reconcileStoryEngineProductBuild({
        directive: directiveRecord as unknown as ProductBuildDirective,
        receipt: receiptRecord as unknown as ProductBuildReceipt,
        runtimeIdentityBefore,
        runtimeIdentityAfter,
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({
        ok: true,
        contract: PRODUCT_BUILD_RECEIPT_INGRESS_CONTRACT,
        accepted: true,
        reconciled: true,
        reconciliation,
        evidenceState: 'verified-in-request',
        durablePersistencePerformed: false,
        replayProtectionPerformed: false,
        mergeAuthorized: false,
        deployAuthorized: false,
        providerMutationAuthorized: false,
      });
    } catch (error) {
      const detail = error instanceof ProductBuildFederationError
        ? error.message
        : 'Product-build receipt reconciliation failed.';
      return res.status(409).json({
        ok: false,
        contract: PRODUCT_BUILD_RECEIPT_INGRESS_CONTRACT,
        code: 'PRODUCT_BUILD_RECEIPT_RECONCILIATION_FAILED',
        reasons: [detail],
      });
    }
  };
}

export const handleProductBuildReceiptIngest = createProductBuildReceiptIngestHandler();
