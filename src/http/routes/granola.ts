import { Router } from 'express';
import { requireFounder } from '../middleware/requireFounder.js';
import {
  createGranolaReadOnlyClient,
  GranolaReadError,
} from '../../integrations/granola/GranolaReadOnlyClient.js';

/**
 * Founder-only on-demand reads. Disabled by default. No webhook ingress,
 * automatic model forwarding, CRM writes, task creation or external sends.
 */
export const granolaRouter = Router();
granolaRouter.use(requireFounder);
granolaRouter.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

function reader() {
  if (process.env.GRANOLA_READ_ENABLED !== 'true') return null;
  try {
    return createGranolaReadOnlyClient({
      apiKey: process.env.GRANOLA_API_KEY ?? '',
      allowedFolderId: process.env.GRANOLA_ALLOWED_FOLDER_ID ?? '',
    });
  } catch {
    return null;
  }
}

granolaRouter.get('/status', (_req, res) => {
  return res.json({
    provider: 'granola',
    mode: 'read-only',
    configured: Boolean(reader()),
    liveProviderVerified: false,
    mutationAllowed: false,
  });
});

granolaRouter.get('/notes', async (req, res) => {
  const client = reader();
  if (!client) return res.status(503).json({ error: 'GRANOLA_NOT_CONFIGURED' });
  if (req.query.cursor !== undefined && typeof req.query.cursor !== 'string') {
    return res.status(400).json({ error: 'INVALID_CURSOR' });
  }
  try {
    return res.json(await client.listNotes({ cursor: req.query.cursor as string | undefined }));
  } catch (error) {
    const code = error instanceof GranolaReadError ? error.code : 'PROVIDER_UNAVAILABLE';
    const status = code === 'INVALID_CURSOR' ? 400 : code === 'PROVIDER_UNAVAILABLE' ? 502 : 422;
    return res.status(status).json({ error: code });
  }
});

granolaRouter.get('/notes/:noteId/summary', async (req, res) => {
  const client = reader();
  if (!client) return res.status(503).json({ error: 'GRANOLA_NOT_CONFIGURED' });
  try {
    return res.json(await client.getSummary(req.params.noteId));
  } catch (error) {
    const code = error instanceof GranolaReadError ? error.code : 'PROVIDER_UNAVAILABLE';
    const status = code === 'INVALID_NOTE_ID' ? 400
      : code === 'NOTE_OUT_OF_SCOPE' ? 404
      : code === 'PROVIDER_UNAVAILABLE' ? 502 : 422;
    return res.status(status).json({ error: code });
  }
});
