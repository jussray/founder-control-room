import {
  dispatchFounderConveyorAdvance,
  expectedFounderConveyorReceiptId,
  type FounderConveyorAdvanceInput,
  type FounderConveyorDispatchResult,
} from './n8nConveyor.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface N8nActivationProbeOptions {
  expectedHeadSha: string;
  webhookUrl: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
}

export interface N8nActivationProbeReceipt {
  ok: true;
  runId: string;
  projectSlug: 'founder-control-room';
  expectedHeadSha: string;
  fromStage: 'chat';
  toStage: 'workflows';
  receiptId: string;
}

export function createN8nActivationProbeInput(expectedHeadSha: string): FounderConveyorAdvanceInput {
  const sha = expectedHeadSha.trim().toLowerCase();
  if (!FULL_SHA.test(sha)) throw new Error('expectedHeadSha must be a full 40-character Git commit SHA');

  return {
    runId: `n8n-live-probe-${sha}`,
    projectSlug: 'founder-control-room',
    goal: 'Verify one bounded Founder Control Room chat-to-workflows transition returns the canonical v2 n8n receipt.',
    fromStage: 'chat',
    toStage: 'workflows',
    expectedHeadSha: sha,
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
    throw new Error('n8n activation probe returned a receipt that does not match the canonical v2 identity');
  }
}

export async function runN8nActivationProbe(options: N8nActivationProbeOptions): Promise<N8nActivationProbeReceipt> {
  const input = createN8nActivationProbeInput(options.expectedHeadSha);
  const result = await dispatchFounderConveyorAdvance(input, {
    env: {
      N8N_CONVEYOR_ENABLED: 'true',
      N8N_CONVEYOR_WEBHOOK_URL: options.webhookUrl,
      N8N_CONVEYOR_BEARER_TOKEN: options.bearerToken,
    },
    fetchImpl: options.fetchImpl,
  });

  assertProbeSuccess(input, result);

  return {
    ok: true,
    runId: input.runId,
    projectSlug: 'founder-control-room',
    expectedHeadSha: input.expectedHeadSha,
    fromStage: 'chat',
    toStage: 'workflows',
    receiptId: result.receiptId,
  };
}
