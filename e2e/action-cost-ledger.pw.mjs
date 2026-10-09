import express from 'express';
import { request as playwrightRequest } from '@playwright/test';
import {
  actionCostReceiptHash,
  buildActionCostReceipt,
} from '../dist/economics/actionCostLedger.js';
import {
  createActionCostReceiptIngestHandler,
  deriveActionCostReceiptToken,
} from '../dist/http/routes/actionCostReceipts.js';

const ROOT_TOKEN = 'playwright-action-cost-root';
const PRODUCER = 'chief-ai-machine';
const PROJECT_SLUG = 'chief-ai-machine';
const NOW_MS = Date.parse('2026-10-06T22:45:00.000Z');

function canonicalReceipt() {
  return buildActionCostReceipt({
    receiptId: 'pw-chief-001',
    projectSlug: PROJECT_SLUG,
    actionId: 'decision-evaluation',
    actionClass: 'standard',
    occurredAt: '2026-10-06T22:44:00.000Z',
    pricingVersion: 'portfolio-2026-10-v1',
    planId: 'chief-pro-49',
    billingSubjectRef: `sha256:${'c'.repeat(64)}`,
    sourceRef: 'mission:pw-chief-001',
    costBasis: 'provider-reported',
    actualCostUsd: 0.08,
    monthRuntimeCostBeforeUsd: 5.5,
    monthlyRuntimeBudgetUsd: 7.09,
    planNetRevenueUsd: 47.28,
    usage: {
      provider: 'openai',
      model: 'gpt-6-sol',
      inputTokens: 2_000,
      outputTokens: 500,
      toolCalls: 1,
      tools: ['web-search'],
    },
  });
}

const stored = [];
const app = express();
app.post(
  '/ingest/action-cost-receipts/:slug',
  express.json(),
  createActionCostReceiptIngestHandler({
    env: { FCR_ACTION_COST_RECEIPT_ROOT_TOKEN: ROOT_TOKEN },
    now: () => NOW_MS,
    findProject: async (slug) => slug === PROJECT_SLUG
      ? {
          id: 'project-chief',
          slug,
          repoProvider: 'github',
          repoIdentifier: 'jussray/chief-ai-machine',
        }
      : null,
    storeReceipt: async (_projectId, receipt) => {
      stored.push(receipt);
      return 'stored';
    },
  }),
);

const server = await new Promise((resolve) => {
  const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('playwright proof server did not bind a TCP port');

const client = await playwrightRequest.newContext({
  baseURL: `http://127.0.0.1:${address.port}`,
  extraHTTPHeaders: {
    'x-action-cost-producer': PRODUCER,
    'x-action-cost-receipt-token': deriveActionCostReceiptToken(ROOT_TOKEN, PRODUCER, PROJECT_SLUG),
  },
});

try {
  const canonical = canonicalReceipt();
  const accepted = await client.post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`, { data: canonical });
  if (accepted.status() !== 201) {
    throw new Error(`expected canonical receipt 201, got ${accepted.status()}: ${await accepted.text()}`);
  }
  const acceptedBody = await accepted.json();
  if (
    acceptedBody.accepted !== true
    || acceptedBody.receiptHash !== canonical.receiptHash
    || acceptedBody.budgetState !== 'within'
  ) {
    throw new Error(`canonical receipt response drifted: ${JSON.stringify(acceptedBody)}`);
  }

  const derivedTamper = { ...canonical, budgetUtilizationPct: 1 };
  const { receiptHash: _oldHash, ...tamperedIdentity } = derivedTamper;
  const rehashedTamper = {
    ...derivedTamper,
    receiptHash: actionCostReceiptHash(tamperedIdentity),
  };
  const rejectedMath = await client.post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`, { data: rehashedTamper });
  if (rejectedMath.status() !== 400) {
    throw new Error(`expected rehashed derived tamper 400, got ${rejectedMath.status()}: ${await rejectedMath.text()}`);
  }
  const rejectedMathBody = await rejectedMath.json();
  if (!rejectedMathBody.details?.includes('receiptHash does not match canonical action-cost receipt')) {
    throw new Error(`derived tamper rejection reason drifted: ${JSON.stringify(rejectedMathBody)}`);
  }

  const selfAuthorizing = {
    ...canonical,
    authority: { ...canonical.authority, billingMutation: true },
  };
  const rejectedAuthority = await client.post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`, { data: selfAuthorizing });
  if (rejectedAuthority.status() !== 400) {
    throw new Error(`expected self-authorizing receipt 400, got ${rejectedAuthority.status()}: ${await rejectedAuthority.text()}`);
  }

  const { authority: _omittedAuthority, ...authorityFree } = canonical;
  const rejectedMissingAuthority = await client.post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`, {
    data: authorityFree,
  });
  if (rejectedMissingAuthority.status() !== 400) {
    throw new Error(`expected missing authority 400, got ${rejectedMissingAuthority.status()}`);
  }

  const rejectedMalformedUsage = await client.post(`/ingest/action-cost-receipts/${PROJECT_SLUG}`, {
    data: { ...canonical, usage: { ...canonical.usage, tools: [12] } },
  });
  if (rejectedMalformedUsage.status() !== 400) {
    throw new Error(`expected malformed usage 400, got ${rejectedMalformedUsage.status()}`);
  }

  if (stored.length !== 1) {
    throw new Error(`only canonical receipt may persist; observed ${stored.length} stored receipts`);
  }

  console.log(JSON.stringify({
    contract: 'fcr/action-cost-ledger-playwright-proof@v1',
    acceptedCanonical: true,
    rejectedRehashedDerivedTamper: true,
    rejectedSelfAuthorization: true,
    rejectedMissingAuthority: true,
    rejectedMalformedUsage: true,
    persistedReceipts: stored.length,
  }));
} finally {
  await client.dispose();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
