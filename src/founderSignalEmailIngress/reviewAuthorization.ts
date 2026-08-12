import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import type { FounderSignalReviewEmailReceipt } from './receipt.js';
import {
  founderSignalReviewContextRepository,
  processFounderSignalReviewCommand,
  type FounderSignalReviewContextRepository,
  type FounderSignalReviewDispatchRepository,
  type FounderSignalReviewProcessingResult,
} from './reviewExecution.js';

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function blocked(): FounderSignalReviewProcessingResult {
  return {
    authorizationState: 'blocked_context_mismatch',
    executionAllowed: false,
    providerDispatchAccepted: false,
    providerExecutionProven: false,
    providerActionsRequested: 0,
    idempotencyKey: null,
  };
}

export async function processFounderSignalReviewCommandWithCapability(
  receipt: FounderSignalReviewEmailReceipt,
  options: {
    contextRepository?: FounderSignalReviewContextRepository;
    dispatchRepository?: FounderSignalReviewDispatchRepository;
    fetchImpl?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<FounderSignalReviewProcessingResult> {
  const contextRepository = options.contextRepository ?? founderSignalReviewContextRepository;
  const context = await contextRepository.find(receipt.replyContextId);
  if (!context) {
    return {
      authorizationState: 'blocked_context_missing',
      executionAllowed: false,
      providerDispatchAccepted: false,
      providerExecutionProven: false,
      providerActionsRequested: 0,
      idempotencyKey: null,
    };
  }

  if (!safeEqual(receipt.reviewTokenHash, context.reviewTokenHash)) {
    return blocked();
  }

  return processFounderSignalReviewCommand(receipt, {
    ...options,
    contextRepository: {
      find: async (replyContextId) => replyContextId === context.replyContextId ? context : null,
      store: contextRepository.store.bind(contextRepository),
    },
  });
}
