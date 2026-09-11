import type { V10CapabilityPlan } from '../src/founder-os-lab/capabilityKernel.js';
import { runN8nActivationProbe } from '../src/lib/n8nActivationProbe.js';
import { FOUNDER_CONVEYOR_ERROR_CONTRACT } from '../src/lib/n8nConveyor.js';
import type {
  V10ConveyorReceiptRecord,
  V10ConveyorReceiptStore,
} from '../src/lib/v10ConveyorReceiptStore.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const expectedHeadSha = (process.env.N8N_CONVEYOR_PROBE_HEAD_SHA ?? process.env.GITHUB_SHA ?? '').trim();
if (!expectedHeadSha) throw new Error('N8N_CONVEYOR_PROBE_HEAD_SHA or GITHUB_SHA is required');

let capabilityPlan: V10CapabilityPlan;
try {
  capabilityPlan = JSON.parse(required('N8N_CONVEYOR_CAPABILITY_PLAN_JSON')) as V10CapabilityPlan;
} catch (error) {
  throw new Error(`N8N_CONVEYOR_CAPABILITY_PLAN_JSON must be valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`);
}

let storedReceipt: V10ConveyorReceiptRecord | null = null;
const ephemeralReceiptStore: V10ConveyorReceiptStore = {
  async store(receipt) {
    if (storedReceipt) {
      return JSON.stringify(storedReceipt) === JSON.stringify(receipt) ? 'duplicate' : 'conflict';
    }
    storedReceipt = structuredClone(receipt);
    return 'stored';
  },
};

const webhookUrl = required('N8N_CONVEYOR_WEBHOOK_URL');
const bearerToken = required('N8N_CONVEYOR_BEARER_TOKEN');
const receipt = await runN8nActivationProbe({
  expectedHeadSha,
  capabilityPlan,
  webhookUrl,
  bearerToken,
  receiptStore: ephemeralReceiptStore,
});

const persisted = storedReceipt as V10ConveyorReceiptRecord | null;
if (!persisted) throw new Error('ephemeral runtime proof did not exercise V10 receipt persistence');
if (persisted.receiptId !== receipt.receiptId
  || persisted.expectedHeadSha !== receipt.expectedHeadSha
  || persisted.capabilityPlanHash !== receipt.capabilityPlanHash
  || persisted.registryHash !== receipt.registryHash
  || persisted.fromStage !== receipt.fromStage
  || persisted.toStage !== receipt.toStage
  || persisted.executionStatus !== 'accepted'
  || persisted.evidenceDigest !== null) {
  throw new Error('ephemeral runtime proof persisted receipt identity drifted from the canonical activation receipt');
}

const rejectionResponse = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    contract: 'founder-control-room/n8n-conveyor@v3',
    event: 'conveyor.stage.advance',
    idempotencyKey: 'invalid-idempotency-key',
  }),
});
if (rejectionResponse.status !== 422) {
  throw new Error(`ephemeral runtime proof expected classified validation HTTP 422, got ${rejectionResponse.status}`);
}

const rejectionBody = record(await rejectionResponse.json());
if (!rejectionBody
  || rejectionBody.accepted !== false
  || rejectionBody.contract !== FOUNDER_CONVEYOR_ERROR_CONTRACT
  || rejectionBody.failureClass !== 'SHA_IDENTITY'
  || rejectionBody.errorCode !== 'IDENTITY_REJECTED'
  || rejectionBody.retryable !== false) {
  throw new Error('ephemeral runtime proof did not return the canonical safe validation error envelope');
}
const rejectionKeys = Object.keys(rejectionBody).sort();
if (JSON.stringify(rejectionKeys) !== JSON.stringify([
  'accepted',
  'contract',
  'errorCode',
  'failureClass',
  'retryable',
])) {
  throw new Error('ephemeral runtime proof validation envelope exposed unexpected fields');
}

process.stdout.write(`${JSON.stringify({
  verified: true,
  persistenceProof: 'ephemeral-in-memory-store',
  productionPersistenceClaimed: false,
  rejectionProof: {
    status: rejectionResponse.status,
    contract: rejectionBody.contract,
    failureClass: rejectionBody.failureClass,
    errorCode: rejectionBody.errorCode,
    retryable: rejectionBody.retryable,
  },
  ...receipt,
}, null, 2)}\n`);
