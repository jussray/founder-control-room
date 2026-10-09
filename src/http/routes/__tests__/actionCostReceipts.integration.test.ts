import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  actionCostReceiptHash,
  buildActionCostReceipt,
  type ActionCostReceiptV1,
} from '../../../economics/actionCostLedger.js';
import {
  createActionCostReceiptIngestHandler,
  deriveActionCostReceiptToken,
  type ActionCostStoreDisposition,
} from '../actionCostReceipts.js';

const ROOT_TOKEN = 'action-cost-root-test-token';
const PRODUCER = 'chief-ai-machine';
const PROJECT_SLUG = 'chief-ai-machine';
const RECEIPT_TOKEN = deriveActionCostReceiptToken(ROOT_TOKEN, PRODUCER, PROJECT_SLUG);
const NOW_MS = Date.parse('2026-10-06T22:40:00.000Z');

function receipt(overrides: Record<string, unknown> = {}): ActionCostReceiptV1 {
  return buildActionCostReceipt({
    receiptId: 'chief-run-001',
    projectSlug: PROJECT_SLUG,
    actionId: 'decision-evaluation',
    actionClass: 'standard',
    occurredAt: '2026-10-06T22:35:00.000Z',
    pricingVersion: 'portfolio-2026-10-v1',
    planId: 'chief-pro-49',
    billingSubjectRef: `sha256:${'b'.repeat(64)}`,
    sourceRef: 'mission:chief-001',
    costBasis: 'provider-reported',
    actualCostUsd: 0.08,
    monthRuntimeCostBeforeUsd: 5.50,
    monthlyRuntimeBudgetUsd: 7.09,
    planNetRevenueUsd: 47.28,
    usage: {
      provider: 'openai',
      model: 'gpt-6-sol',
      inputTokens: 2000,
      outputTokens: 500,
      toolCalls: 1,
      tools: ['web-search'],
    },
    ...overrides,
  } as never);
}

function appWith(
  disposition: ActionCostStoreDisposition = 'stored',
  env: NodeJS.ProcessEnv = { FCR_ACTION_COST_RECEIPT_ROOT_TOKEN: ROOT_TOKEN },
  findProjectOverride?: (slug: string) => Promise<{
    id: string;
    slug: string;
    repoProvider: string | null;
    repoIdentifier: string | null;
  } | null>,
) {
  const app = express();
  const stored: ActionCostReceiptV1[] = [];
  let storeCalls = 0;

  app.post(
    '/ingest/action-cost-receipts/:slug',
    express.json(),
    createActionCostReceiptIngestHandler({
      env,
      now: () => NOW_MS,
      findProject: findProjectOverride ?? (async (slug) => slug === PROJECT_SLUG
        ? {
            id: 'project-chief',
            slug,
            repoProvider: 'github',
            repoIdentifier: 'jussray/chief-ai-machine',
          }
        : null),
      storeReceipt: async (_projectId, value) => {
        storeCalls += 1;
        stored.push(value);
        return disposition;
      },
    }),
  );

  return { app, stored, storeCalls: () => storeCalls };
}

function authorized(req: request.Test) {
  return req
    .set('x-action-cost-producer', PRODUCER)
    .set('x-action-cost-receipt-token', RECEIPT_TOKEN);
}

describe('action-cost receipt ingress', () => {
  it('accepts a canonical project-bound receipt without granting billing authority', async () => {
    const harness = appWith();
    const value = receipt();
    const response = await authorized(
      request(harness.app).post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`),
    ).send(value);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      accepted: true,
      duplicate: false,
      receiptId: value.receiptId,
      receiptHash: value.receiptHash,
      contract: 'juss/action-cost-receipt@v1',
      budgetState: 'within',
      actionClassState: 'within',
    });
    expect(harness.storeCalls()).toBe(1);
    expect(harness.stored[0]?.authority).toEqual({
      billingMutation: false,
      pricingMutation: false,
      subscriptionMutation: false,
      providerMutation: false,
    });
  });

  it('treats a repeated receipt id as an idempotent duplicate disposition', async () => {
    const harness = appWith('duplicate');
    const response = await authorized(
      request(harness.app).post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`),
    ).send(receipt());

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(true);
    expect(harness.storeCalls()).toBe(1);
  });

  it('binds producer credentials to the enrolled project and repository', async () => {
    const harness = appWith();
    const wrongPath = await authorized(
      request(harness.app).post('/ingest/action-cost-receipts/promptos'),
    ).send(receipt({ projectSlug: 'promptos' }));
    expect(wrongPath.status).toBe(403);
    expect(wrongPath.body.error).toBe('producer_project_not_allowed');

    const wrongRepository = appWith('stored', undefined, async (slug) => ({
      id: 'project-chief',
      slug,
      repoProvider: 'github',
      repoIdentifier: 'jussray/not-chief',
    }));
    const mismatch = await authorized(
      request(wrongRepository.app).post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`),
    ).send(receipt());
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error).toBe('producer_project_mismatch');
    expect(harness.storeCalls()).toBe(0);
    expect(wrongRepository.storeCalls()).toBe(0);
  });

  it('rejects bad credentials and fails closed when ingestion is not configured', async () => {
    const harness = appWith();
    const badToken = await request(harness.app)
      .post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`)
      .set('x-action-cost-producer', PRODUCER)
      .set('x-action-cost-receipt-token', 'bad-token')
      .send(receipt());
    expect(badToken.status).toBe(401);

    const unconfigured = appWith('stored', {});
    const unavailable = await request(unconfigured.app)
      .post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`)
      .set('x-action-cost-producer', PRODUCER)
      .send(receipt());
    expect(unavailable.status).toBe(503);
  });

  it('rejects tampered or self-authorizing receipts before persistence', async () => {
    const harness = appWith();
    const canonical = receipt();
    const tampered = { ...canonical, budgetUtilizationPct: 1 };
    const { receiptHash: _oldHash, ...identity } = tampered;
    const rehashed = { ...tampered, receiptHash: actionCostReceiptHash(identity as never) };

    const badEconomics = await authorized(
      request(harness.app).post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`),
    ).send(rehashed);
    expect(badEconomics.status).toBe(400);
    expect(badEconomics.body.details).toContain('receiptHash does not match canonical action-cost receipt');

    const selfAuthorizing = {
      ...canonical,
      authority: { ...canonical.authority, billingMutation: true },
    };
    const badAuthority = await authorized(
      request(harness.app).post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`),
    ).send(selfAuthorizing);
    expect(badAuthority.status).toBe(400);
    expect(badAuthority.body.details).toContain('action-cost receipt cannot carry mutation authority');
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects raw billing identifiers and non-operational source references at the schema boundary', async () => {
    const harness = appWith();
    const canonical = receipt();
    const bad = {
      ...canonical,
      billingSubjectRef: 'person@example.com',
      sourceRef: 'raw customer prompt with spaces',
    };

    const response = await authorized(
      request(harness.app).post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`),
    ).send(bad);

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(expect.arrayContaining([
      'billingSubjectRef must be a sha256 opaque reference',
      'sourceRef must be an opaque operational reference',
    ]));
    expect(harness.storeCalls()).toBe(0);
  });

  it('fails closed for malformed JSON bodies and incomplete or extra authority fields', async () => {
    const harness = appWith();
    const canonical = receipt();
    const malformedBodies: unknown[] = [
      null,
      [],
      { ...canonical, receiptId: 10 },
      { ...canonical, authority: undefined },
      { ...canonical, authority: {} },
      { ...canonical, authority: { ...canonical.authority, extraPermission: false } },
      { ...canonical, usage: { ...canonical.usage, tools: [10] } },
    ];

    for (const body of malformedBodies) {
      const response = await authorized(
        request(harness.app)
          .post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`)
          .set('Content-Type', 'application/json'),
      ).send(body as object | undefined);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_action_cost_receipt');
    }
    expect(harness.storeCalls()).toBe(0);
  });

  it('accepts estimates but preserves them as estimated truth', async () => {
    const harness = appWith();
    const value = receipt({ costBasis: 'estimated' });
    const response = await authorized(
      request(harness.app).post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`),
    ).send(value);

    expect(response.status).toBe(201);
    expect(harness.stored[0]?.costTruth).toBe('estimated');
  });

  it('rejects receipts timestamped beyond the allowed future clock skew', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`),
    ).send(receipt({ occurredAt: '2026-10-06T22:46:00.000Z' }));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('receipt_occurred_at_too_far_in_future');
    expect(harness.storeCalls()).toBe(0);
  });
});
