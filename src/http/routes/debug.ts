/**
 * Debug routes — CI and founder inspection only.
 *
 * GET /_debug/provider
 *   Returns which AI provider is configured, whether mock/fallback
 *   mode is active, and key presence (never key values).
 *
 * Safety:
 * - Never exposes key values, only boolean presence
 * - Does not perform any AI call
 * - Does not mutate any state
 * - Development/CI may read it without founder auth
 * - Cloudflare and production runtimes require the existing founder auth boundary
 */
import { Router } from 'express';
import { requiresFounderForDebugSurface } from '../runtimeBoundary.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const debugRouter = Router();

// The Cloudflare Worker entry point marks itself explicitly before importing
// the Express server. Node deployments additionally fail closed on either
// canonical production environment marker. This avoids depending on whether a
// provider binding is mirrored into process.env at runtime.
debugRouter.use((req, res, next) => {
  if (!requiresFounderForDebugSurface()) return next();
  return requireFounder(req as FounderRequest, res, next);
});

debugRouter.get('/provider', (_req, res) => {
  const openaiKeyPresent = typeof process.env.OPENAI_API_KEY === 'string' &&
    process.env.OPENAI_API_KEY.length > 10;

  const perplexityKeyPresent = typeof process.env.PERPLEXITY_API_KEY === 'string' &&
    process.env.PERPLEXITY_API_KEY.length > 10;

  // Explicit mock/fallback detection
  const isMock = process.env.USE_MOCK_AI === 'true' ||
    process.env.AI_PROVIDER === 'mock';

  const isFallback = process.env.AI_PROVIDER === 'fallback';

  // Determine active provider name
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
    environment: process.env.ENVIRONMENT ?? 'unknown',
  });
});
