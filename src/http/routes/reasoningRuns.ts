import { Router } from 'express';
import {
  cookieBoundaryFingerprint,
  createReasoningArtifactEnvelope,
  createReasoningRunReceipt,
  type ReasoningRunInput,
  type ReasoningAuthTransport,
} from '../../reasoningRuns/reasoningRun.js';
import { supabase } from '../../lib/supabaseClient.js';
import { storeReasoningRun } from '../../services/reasoningRunStore.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const reasoningRunsRouter = Router();
reasoningRunsRouter.use(requireFounder);

const FORBIDDEN_KEYS = new Set([
  'prompt',
  'rawprompt',
  'messages',
  'transcript',
  'chainofthought',
  'reasoning',
  'cookies',
  'cookie',
  'accesstoken',
  'refreshtoken',
  'csrftoken',
  'authorization',
  'toolpayload',
  'toolpayloads',
  'rawtoolpayloads',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsForbiddenKey(value: unknown, depth = 0): string | null {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = containsForbiddenKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return key;
    const found = containsForbiddenKey(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function authTransport(req: FounderRequest): ReasoningAuthTransport {
  const header = req.headers.authorization;
  return typeof header === 'string' && /^Bearer\s+/i.test(header)
    ? 'bearer'
    : 'founder-session-cookie';
}

reasoningRunsRouter.post('/:slug/reasoning-runs', async (req: FounderRequest, res) => {
  const slug = req.params.slug?.trim() ?? '';
  if (!slug) return res.status(400).json({ error: 'project slug is required' });

  const forbidden = containsForbiddenKey(req.body);
  if (forbidden) {
    return res.status(400).json({
      error: 'Reasoning receipts accept sanitized operational intent, fingerprints, and bounded receipts only.',
      code: 'RAW_REASONING_DATA_FORBIDDEN',
      forbiddenKey: forbidden,
    });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, slug, repo_identifier')
    .eq('slug', slug)
    .maybeSingle();

  if (projectError) return res.status(503).json({ error: 'project lookup failed' });
  if (!project) return res.status(404).json({ error: 'project not registered' });

  const transport = authTransport(req);
  const body = isRecord(req.body) ? req.body : {};
  const input = {
    ...body,
    // This generic founder-authenticated route cannot independently attest that
    // a caller is ChatGPT, Product Design, Data Analytics, or another tool.
    // Dedicated signed bridges may stamp those sources later. Until then,
    // fail closed on provenance instead of trusting a caller-supplied source.
    source: 'other',
    projectSlug: project.slug,
    ...(typeof project.repo_identifier === 'string' && project.repo_identifier.trim()
      ? { repository: project.repo_identifier.trim() }
      : {}),
    auth: {
      transport,
      cookieBoundaryContract: 'fcr/cookie-boundary@v1',
      cookieBoundaryFingerprint: cookieBoundaryFingerprint(transport),
      rawCookieValuesStored: false,
    },
  } as unknown as ReasoningRunInput;

  let receipt;
  try {
    receipt = createReasoningRunReceipt(input);
  } catch (error) {
    return res.status(400).json({
      error: 'reasoning receipt validation failed',
      details: error instanceof Error ? error.message.split('; ') : ['invalid receipt'],
    });
  }

  try {
    const disposition = await storeReasoningRun(project.id, receipt);
    if (disposition === 'conflict') {
      return res.status(409).json({
        error: 'chain iteration already exists with a different receipt fingerprint',
        code: 'REASONING_RUN_CONFLICT',
      });
    }

    const artifact = createReasoningArtifactEnvelope(receipt);
    res.set('Cache-Control', 'no-store');
    return res.status(disposition === 'stored' ? 201 : 200).json({
      disposition,
      receipt: {
        contract: receipt.contract,
        chainId: receipt.chainId,
        source: receipt.source,
        intentFingerprintScheme: receipt.intentFingerprintScheme,
        intentFingerprint: receipt.intentFingerprint,
        iteration: receipt.iteration,
        stopReason: receipt.stopReason,
        receiptFingerprint: receipt.receiptFingerprint,
        quality: receipt.quality,
        privacy: receipt.privacy,
      },
      artifact: {
        contract: artifact.contract,
        path: artifact.path,
        mediaType: artifact.mediaType,
        sha256: artifact.sha256,
        receiptFingerprint: artifact.receiptFingerprint,
        materialized: artifact.materialized,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('reasoning_run_prior_receipt_')) {
      return res.status(409).json({
        error: 'reasoning self-audit chain is not continuous',
        code: 'REASONING_CHAIN_INVALID',
      });
    }
    return res.status(503).json({ error: 'reasoning receipt persistence failed' });
  }
});
