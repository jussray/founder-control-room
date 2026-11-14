import { createHash } from 'node:crypto';

export const VOICE_COUNCIL_INTENT_CONTRACT = 'fcr.voice-council-intent.v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const OPERATIONS = new Set(['repo.read', 'browser.inspect', 'council.propose']);
const FIELDS = new Set(['contract','requestId','actorId','workspaceId','transcriptDigest','sourceKind','observedAt','goal','repository','branch','expectedHeadSha','requestedOperations','evidenceRefs','riskClass','approvalState','councilQuestion']);

export interface VoiceCouncilIntent {
  contract: typeof VOICE_COUNCIL_INTENT_CONTRACT;
  requestId: string;
  actorId: string;
  workspaceId: string;
  transcriptDigest: string;
  sourceKind: 'voice' | 'text';
  observedAt: string;
  goal: string;
  repository: string;
  branch: string;
  expectedHeadSha: string;
  requestedOperations: Array<'repo.read' | 'browser.inspect' | 'council.propose'>;
  evidenceRefs: string[];
  riskClass: 'low' | 'medium' | 'high';
  approvalState: 'unapproved';
  councilQuestion: string;
}

export function validateVoiceCouncilIntent(value: unknown): { valid: boolean; errors: string[]; digest: string | null; executionAuthorized: false } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['intent must be an object'], digest: null, executionAuthorized: false };
  }
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) if (!FIELDS.has(key)) errors.push('unknown field: ' + key);
  const bounded = (key: string, max: number) => {
    const v = raw[key];
    if (typeof v !== 'string' || !v.trim() || v.length > max) errors.push('invalid ' + key);
  };
  for (const key of ['requestId','actorId','workspaceId']) bounded(key, 160);
  for (const key of ['goal','councilQuestion']) bounded(key, 4000);
  bounded('repository', 200);
  bounded('branch', 200);
  if (raw.contract !== VOICE_COUNCIL_INTENT_CONTRACT) errors.push('invalid contract');
  if (typeof raw.transcriptDigest !== 'string' || !SHA256.test(raw.transcriptDigest)) errors.push('invalid transcriptDigest');
  if (typeof raw.expectedHeadSha !== 'string' || !SHA.test(raw.expectedHeadSha)) errors.push('invalid expectedHeadSha');
  if (raw.sourceKind !== 'voice' && raw.sourceKind !== 'text') errors.push('invalid sourceKind');
  if (typeof raw.observedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(raw.observedAt) || Number.isNaN(Date.parse(raw.observedAt))) errors.push('invalid observedAt');
  if (raw.approvalState !== 'unapproved') errors.push('voice intent cannot approve actions');
  if (!['low','medium','high'].includes(String(raw.riskClass))) errors.push('invalid riskClass');
  if (typeof raw.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw.repository)) errors.push('invalid repository');
  if (typeof raw.branch !== 'string' || raw.branch.startsWith('-') || raw.branch.includes('..') || /[\s~^:?*\[\\]/.test(raw.branch)) errors.push('invalid branch');
  if (!Array.isArray(raw.requestedOperations) || !raw.requestedOperations.length || raw.requestedOperations.length > 3 || raw.requestedOperations.some(x => typeof x !== 'string' || !OPERATIONS.has(x)) || new Set(raw.requestedOperations).size !== raw.requestedOperations.length) errors.push('invalid requestedOperations');
  if (!Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.length > 20 || raw.evidenceRefs.some(x => typeof x !== 'string' || !x.trim() || x.length > 500)) errors.push('invalid evidenceRefs');
  if (errors.length) return { valid: false, errors, digest: null, executionAuthorized: false };
  const canonical = Object.keys(raw).sort().map(key => [key, raw[key]]);
  return { valid: true, errors: [], digest: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'), executionAuthorized: false };
}
