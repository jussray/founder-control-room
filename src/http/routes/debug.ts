/**
 * Debug routes — authenticated founder/CI inspection only.
 *
 * GET /_debug/provider
 *   Returns which AI provider is configured, whether mock/fallback
 *   mode is active, and key presence (never key values).
 *
 * Safety:
 * - Requires the normal platform-founder authority boundary
 * - Never exposes key values, only boolean presence
 * - Does not perform any AI call
 * - Does not mutate any state
 * - Responses are private/no-store
 */
import { Router } from 'express';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const debugRouter = Router();
debugRouter.use(requireFounder);

debugRouter.get('/provider', (_req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'private, no-store');

  const openaiKeyPresent = typeof process.env.OPENAI_API_KEY === 'string' &&
    process.env.OPENAI_API_KEY.length > 10;

  const perplexityKeyPresent = typeof process.env.PERPLEXITY_API_KEY === 'string' &&
    process.env.PERPLEXITY_API_KEY.length > 10;

  const isMock = process.env.USE_MOCK_AI === 'true' ||
    process.env.AI_PROVIDER === 'mock';

  const isFallback = process.env.AI_PROVIDER === 'fallback';

  let provider: string;
  if (isMock) {
    provider = 'mock';
  } else if (isFallback) {
    provider = 'fallback';
  } else if (process.env.AI_PROVIDER === 'perplexity' || perplexityKeyPresent && !openaiKeyPresent) {
    provider = 'perplexity';
  } else if (openaiKeyPresent) {
    provider = 'openai';
  } else {
    provider = 'unconfigured';
  }

  res.json({
    provider,
    mock: isMock,
    fallback: isFallback,
    openaiKeyPresent,
    perplexityKeyPresent,
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
  });
});
