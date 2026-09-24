import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';

/**
 * Runtime-owned adapter registry for peer operator relay.
 *
 * This module deliberately exports no implicit provider fallbacks. A requested
 * operator must have its own configured adapter or dispatch fails closed.
 * Provider credentials stay in the server/runtime environment and never cross
 * the relay packet boundary.
 */
export function createOperatorRelayAdapters(input: OperatorRelayAdapters): OperatorRelayAdapters {
  return {
    gemini: input.gemini,
    codex: input.codex,
    'claude-code': input['claude-code'],
    perplexity: input.perplexity,
  };
}
