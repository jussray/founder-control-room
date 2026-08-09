import type { V10CapabilityPlan } from '../founder-os-lab/capabilityKernel.js';
import {
  dispatchFounderConveyorAdvance,
  expectedFounderConveyorReceiptId,
  type FounderConveyorAdvanceInput,
  type FounderConveyorDispatchResult,
} from './n8nConveyor.js';
import type { V10ConveyorReceiptStore } from './v10ConveyorReceiptStore.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface N8nActivationProbeOptions {
  expectedHeadSha: string;
  capabilityPlan: V10CapabilityPlan;
  webhookUrl: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
  receiptStore?: V10ConveyorReceiptStore;
}

export interface N8nActivationProbeReceipt {
  ok: true;
  runId: string;
  projectSlug: 'founder-control-room';
  expectedHeadSha: string;
  capabilityPlanHash: string;
  registryHash: string;
  fromStage: 'chat';
  toStage: 'workflows';
  receiptId: string;
}

export function createN8nActivationProbeInput(
  expectedHeadSha: string,
  capabilityPlan: V10CapabilityPlan,
): FounderConveyorAdvanceInput {
  const sha = expectedHeadSha.trim().toLowerCase();
  if (!FULL_SHA.test(sha)) throw new Error('expectedHeadSha must be a full 40-character Git commit SHA');

  return {
    runId: `n8n-live-probe-${sha}`,
    projectSlug: 'founder-control-room',
    goal: capabilityPlan.goal,
    fromStage: 'chat',
    toStage: 'workflows',
    expectedHeadSha: sha,
    capabilityPlan,
    evidenceUrls: [],
  };
}

function assertProbeSuccess(
  input: FounderConveyorAdvanceInput,
  result: FounderConveyorDispatchResult,
): asserts result is FounderConveyorDispatchResult & { ok: true; receiptId: string } {
  if (!result.ok || !result.receiptId) {
    throw new Error(`n8n activation probe failed: ${result.code}${result.reasons.length ? `: ${result.reasons.join('; ')}` : ''}`);
  }
  const expectedReceiptId = expectedFounderConveyorReceiptId(input);
  if (result.receiptId !== expectedReceiptId) {
    throw new Error('n8n activation probe returned a receipt that does not match the canonical v3 capability-plan-bound identity');
  }
}

export async function runN8nActivationProbe(options: N8nActivationProbeOptions): Promise<N8nActivationProbeReceipt> {
  const input = createN8nActivationProbeInput(options.expectedHeadSha, options.capabilityPlan);
  const result = await dispatchFounderConveyorAdvance(input, {
    env: {
      N8N_CONVEYOR_ENABLED: 'true',
      N8N_CONVEYOR_WEBHOOK_URL: options.webhookUrl,
      N8N_CONVEYOR_BEARER_TOKEN: options.bearerToken,
      FCR_V10_RECEIPT_PERSISTENCE_REQUIRED: 'true',
    },
    fetchImpl: options.fetchImpl,
    receiptStore: options.receiptStore,
  });

  assertProbeSuccess(input, result);

  return {
    ok: true,
    runId: input.runId,
    projectSlug: 'founder-control-room',
    expectedHeadSha: input.expectedHeadSha,
    capabilityPlanHash: input.capabilityPlan.planHash,
    registryHash: input.capabilityPlan.registryHash,
    fromStage: 'chat',
    toStage: 'workflows',
    receiptId: result.receiptId,
  };
}
