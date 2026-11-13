import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const johnstownAiPilotRouter = Router();
johnstownAiPilotRouter.use(requireFounder);

const TYPES = new Set(['partner', 'participant', 'workflow', 'outcome', 'action']);
const STAGES = new Set(['recruit', 'baseline', 'train', 'build', 'handoff', 'measure', 'decide']);
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;

johnstownAiPilotRouter.get('/records', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('johnstown_ai_pilot_records')
    .select('id, record_type, title, stage, evidence_state, source_url, review_note, proof, rollback_note, next_gate, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const records = data ?? [];
  return res.json({
    records,
    summary: {
      confirmed: records.filter((r) => r.evidence_state === 'confirmed').length,
      stale: records.filter((r) => r.evidence_state === 'stale').length,
      unknown: records.filter((r) => r.evidence_state === 'unknown').length,
    },
  });
});

johnstownAiPilotRouter.post('/records', async (req: FounderRequest, res) => {
  const body = req.body as Record<string, unknown>;
  const title = text(body.title, 180);
  const recordType = typeof body.recordType === 'string' ? body.recordType : '';
  const stage = typeof body.stage === 'string' ? body.stage : '';
  if (!title || !TYPES.has(recordType) || !STAGES.has(stage)) return res.status(400).json({ error: 'title, recordType and stage are required.' });
  const sourceUrl = body.sourceUrl === '' || body.sourceUrl === undefined ? null : text(body.sourceUrl, 1000);
  const reviewNote = body.reviewNote === '' || body.reviewNote === undefined ? null : text(body.reviewNote, 4000);
  const nextGate = text(body.nextGate, 1000) ?? 'Add a source link and founder review note before advancing.';
  const proof = body.proof && typeof body.proof === 'object' && !Array.isArray(body.proof) ? body.proof : {};
  const { data, error } = await supabase.from('johnstown_ai_pilot_records').insert({
    record_type: recordType, title, stage, evidence_state: 'unknown', source_url: sourceUrl,
    review_note: reviewNote, proof, next_gate: nextGate,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ record: data });
});
