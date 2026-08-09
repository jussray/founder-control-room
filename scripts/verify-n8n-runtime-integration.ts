import type { V10CapabilityPlan } from '../src/founder-os-lab/capabilityKernel.js';
import { runN8nActivationProbe } from '../src/lib/n8nActivationProbe.js';
import type {
  V10ConveyorReceiptRecord,
  V10ConveyorReceiptStore,
} from '../src/lib/v10ConveyorReceiptStore.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
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

const receipt = await runN8nActivationProbe({
  expectedHeadSha,
  capabilityPlan,
  webhookUrl: required('N8N_CONVEYOR_WEBHOOK_URL'),
  bearerToken: required('N8N_CONVEYOR_BEARER_TOKEN'),
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

process.stdout.write(`${JSON.stringify({
  verified: true,
  persistenceProof: 'ephemeral-in-memory-store',
  productionPersistenceClaimed: false,
  ...receipt,
}, null, 2)}\n`);
