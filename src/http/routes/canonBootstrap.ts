import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { readCanonKnowledge, type CanonEvent } from '../../lib/canonKnowledge.js';
import { requireFounder } from '../middleware/requireFounder.js';

/** Authenticated historical bootstrap; deliberately cannot grant execution authority. */
export const canonBootstrapRouter = Router();
canonBootstrapRouter.use(requireFounder);
canonBootstrapRouter.get('/bootstrap', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  const project = typeof req.query.project === 'string' ? req.query.project : '';
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(project)
    || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(key)) {
    return res.status(400).json({ error: 'project_and_key_required' });
  }
  try {
    const registered = await supabase.from('projects').select('id').eq('slug', project).maybeSingle();
    if (registered.error) return res.status(503).json({ error: 'project_registry_unavailable' });
    if (!registered.data) return res.status(404).json({ error: 'project_not_registered' });
    const result = await supabase.from('canon_knowledge_events')
      .select('project,claim_key,sequence,contract,digest,observed_at,receipt_id,authority,source_ref,verifier_id,action,supersedes,event_hash')
      .eq('project', project).eq('claim_key', key)
      .order('sequence', { ascending: true }).limit(500);
    if (result.error) return res.status(503).json({ error: 'canon_store_unavailable' });
    const events = (result.data ?? []).map((row) => ({
      project: row.project, key: row.claim_key, sequence: row.sequence,
      contract: row.contract, digest: row.digest, observedAt: new Date(row.observed_at).toISOString(),
      receiptId: row.receipt_id, authority: row.authority, sourceRef: row.source_ref,
      verifierId: row.verifier_id, action: row.action, supersedes: row.supersedes,
      eventHash: row.event_hash,
    })) as CanonEvent[];
    const summary = readCanonKnowledge(events, { project, key });
    return res.json({ ...summary, events, scope: 'historical_only', executionAuthorized: false,
      truncated: events.length === 500 });
  } catch {
    return res.status(503).json({ error: 'canon_integrity_or_provider_failure' });
  }
});
