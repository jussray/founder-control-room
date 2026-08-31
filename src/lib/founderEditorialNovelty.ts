import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type JsonRecord = Record<string, unknown>;

export const FOUNDER_EDITORIAL_NOVELTY_CONTRACT = 'fcr/founder-editorial-novelty@v1' as const;
const EDITORIAL_PATTERN_LANE = 'founder-editorial';
const MAX_HISTORY = 32;
const HIGH_SIMILARITY = 0.55;
const MEDIUM_SIMILARITY = 0.35;
const SHA256 = /^[0-9a-f]{64}$/i;

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'for', 'from', 'had', 'has', 'have',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'so', 'that', 'the', 'their',
  'them', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you',
  'your',
]);

const FOUNDER_MACHINE_ALIASES = new Set([
  'jussray/founder-control-room',
  'founder-control-room',
  'founder control room',
  'foundercontrolroom',
  'fcr',
  'jussray/chief-ai-machine',
  'chief-ai-machine',
  'chief ai machine',
  'chief',
  'jussray/promptos',
  'promptos',
]);

export interface FounderEditorialHistoryRecord {
  id: string;
  relatedProject: string | null;
  coreThesis: string;
  primaryHook: string;
  angle: string;
  meaningfulChange: string | null;
  hookType: string | null;
  proofStyle: string | null;
  publishDate: string | null;
  status: string;
  publicPayloadHash?: string | null;
  publicCopyHash?: string | null;
  historySource?: 'experiment' | 'execution' | 'attestation';
}

export interface FounderEditorialHistoryRepository {
  recentLinkedIn(limit: number): Promise<FounderEditorialHistoryRecord[]>;
}

export interface FounderEditorialIdentity {
  lane: string;
  platform: string;
  project: string;
  coreThesis: string;
  hook: string;
  eventRef: string;
  proofDigest: string;
  publicPayloadHash: string;
  publicCopyHashes: string[];
  promptOsPatternFingerprint: string;
  chiefAngleFingerprint: string;
  storyFingerprint: string;
}

export interface FounderEditorialNoveltyReceipt {
  contract: typeof FOUNDER_EDITORIAL_NOVELTY_CONTRACT;
  allowed: boolean;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  historyState: 'NOT_APPLICABLE' | 'EMPTY' | 'COMPARED';
  comparedCount: number;
  closestMatchId: string | null;
  closestSimilarity: number;
  storyFingerprint: string;
  promptOsPatternFingerprint: string;
  chiefAngleFingerprint: string;
  continuityCookie: string;
  roles: {
    promptos: 'editorial-pattern-grammar';
    chief: 'candidate-angle-proposal';
    fcr: 'history-readback-and-approval-gate';
  };
  authority: {
    publish: false;
    approve: false;
    schedule: false;
  };
  reason: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function digestText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(' ')
      .filter((token) => token.length > 2 && !STOPWORDS.has(token)),
  );
}

function similarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function firstHook(draft: string): string {
  const line = draft.split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? '';
  const sentence = line.split(/(?<=[.!?])\s+/)[0] ?? line;
  return sentence.slice(0, 240).trim();
}

function canonicalLane(sourceRepo: string): string {
  const normalized = sourceRepo
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .trim();
  if (FOUNDER_MACHINE_ALIASES.has(normalized)) return 'founder-machine';
  return normalized || 'unknown-project';
}

function patternFingerprint({ thesis, hook }: { thesis: string; hook: string }): string {
  return hash({
    contract: 'promptos/editorial-pattern@v1',
    lane: EDITORIAL_PATTERN_LANE,
    thesis: normalize(thesis),
    hook: normalize(hook),
  });
}

function publicClaimsText(payload: JsonRecord): string {
  if (!Array.isArray(payload.public_claims)) return '';
  return payload.public_claims
    .map((claim) => text(record(claim).text))
    .filter(Boolean)
    .join(' ');
}

export function founderEditorialPublicCopyHashes(publicCopy: string): string[] {
  const exact = digestText(publicCopy);
  const normalized = digestText(normalize(publicCopy));
  return [...new Set([exact, normalized])];
}

export function buildFounderEditorialIdentity(proposal: JsonRecord): FounderEditorialIdentity {
  const source = record(proposal.source);
  const payload = record(proposal.public_payload);
  const evidence = record(proposal.internal_evidence);
  const sourceRepo = text(source.repo);
  const draft = text(payload.draft_text);
  const claims = publicClaimsText(payload);
  const hook = firstHook(draft);
  const coreThesis = claims || draft.slice(0, 600);
  const eventRef = text(evidence.ref);
  const proofDigest = text(evidence.digest).toLowerCase();
  const project = canonicalLane(sourceRepo);
  const platform = text(payload.platform).toLowerCase();
  const publicPayloadHash = hash(payload);
  const publicCopyHashes = founderEditorialPublicCopyHashes(draft);

  const promptOsPatternFingerprint = patternFingerprint({
    thesis: coreThesis,
    hook,
  });
  const chiefAngleFingerprint = hash({
    contract: 'chief/editorial-angle@v1',
    lane: project,
    eventRef,
    proofDigest,
    storyType: text(payload.story_type).toLowerCase(),
  });
  const storyFingerprint = hash({
    contract: FOUNDER_EDITORIAL_NOVELTY_CONTRACT,
    lane: project,
    platform,
    coreThesis: normalize(coreThesis),
    hook: normalize(hook),
    eventRef,
    proofDigest,
    publicPayloadHash,
    publicCopyHashes,
    promptOsPatternFingerprint,
    chiefAngleFingerprint,
  });

  return {
    lane: project,
    platform,
    project,
    coreThesis,
    hook,
    eventRef,
    proofDigest,
    publicPayloadHash,
    publicCopyHashes,
    promptOsPatternFingerprint,
    chiefAngleFingerprint,
    storyFingerprint,
  };
}

function normalizeHistoryRow(value: unknown): FounderEditorialHistoryRecord {
  const row = record(value);
  return {
    id: text(row.id),
    relatedProject: text(row.related_project) || null,
    coreThesis: text(row.core_thesis),
    primaryHook: text(row.primary_hook),
    angle: text(row.angle),
    meaningfulChange: text(row.meaningful_change) || null,
    hookType: text(row.hook_type) || null,
    proofStyle: text(row.proof_style) || null,
    publishDate: text(row.publish_date) || null,
    status: text(row.status),
    publicPayloadHash: null,
    publicCopyHash: null,
    historySource: 'experiment',
  };
}

function normalizePublicationExecution(value: unknown): FounderEditorialHistoryRecord | null {
  const row = record(value);
  const request = record(row.request);
  const result = record(row.result);
  if (text(row.status) !== 'succeeded' || text(request.platform).toLowerCase() !== 'linkedin') return null;
  const publicPayloadHash = text(request.publicPayloadHash).toLowerCase();
  if (!SHA256.test(publicPayloadHash)) return null;
  return {
    id: `execution:${text(row.id)}`,
    relatedProject: text(request.sourceRepo) || null,
    coreThesis: '',
    primaryHook: '',
    angle: '',
    meaningfulChange: null,
    hookType: null,
    proofStyle: 'provider-readback',
    publishDate: text(result.publishedAt) || text(row.executed_at) || null,
    status: 'published',
    publicPayloadHash,
    publicCopyHash: null,
    historySource: 'execution',
  };
}

function normalizeFounderAttestation(value: unknown): FounderEditorialHistoryRecord | null {
  const row = record(value);
  const observedState = record(row.observed_state);
  const publication = record(observedState.publication);
  const contentHash = text(observedState.contentHash).toLowerCase();
  if (
    text(observedState.platform).toLowerCase() !== 'linkedin'
    || text(publication.state) !== 'USER_ATTESTED'
    || !SHA256.test(contentHash)
  ) return null;
  return {
    id: `attestation:${text(row.resource_id)}`,
    relatedProject: null,
    coreThesis: '',
    primaryHook: '',
    angle: '',
    meaningfulChange: null,
    hookType: null,
    proofStyle: 'founder-attested-public-copy',
    publishDate: text(publication.publishedAt) || text(row.observed_at) || null,
    status: 'published',
    publicPayloadHash: null,
    publicCopyHash: contentHash,
    historySource: 'attestation',
  };
}

function historyTime(value: FounderEditorialHistoryRecord): number {
  const parsed = value.publishDate ? Date.parse(value.publishDate) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function supabaseFounderEditorialHistoryRepository(client: SupabaseClient): FounderEditorialHistoryRepository {
  return {
    async recentLinkedIn(limit) {
      const [experimentsResult, executionsResult, observationsResult] = await Promise.all([
        client
          .from('linkedin_experiments')
          .select('id, related_project, core_thesis, primary_hook, angle, meaningful_change, hook_type, proof_style, publish_date, status')
          .in('status', ['published', 'analyzed'])
          .order('publish_date', { ascending: false, nullsFirst: false })
          .limit(limit),
        client
          .from('approval_executions')
          .select('id, request, result, executed_at, status')
          .in('action_type', ['publish_founder_content'])
          .in('status', ['succeeded'])
          .order('executed_at', { ascending: false, nullsFirst: false })
          .limit(limit),
        client
          .from('provider_observations')
          .select('resource_id, observed_state, observed_at')
          .in('provider', ['linkedin'])
          .in('resource_type', ['founder_content_post'])
          .order('observed_at', { ascending: false, nullsFirst: false })
          .limit(limit),
      ]);

      if (experimentsResult.error) {
        throw new Error(`editorial experiment history readback failed: ${experimentsResult.error.message}`);
      }
      if (executionsResult.error) {
        throw new Error(`editorial publication execution history readback failed: ${executionsResult.error.message}`);
      }
      if (observationsResult.error) {
        throw new Error(`editorial founder-attestation history readback failed: ${observationsResult.error.message}`);
      }

      const experiments = Array.isArray(experimentsResult.data)
        ? experimentsResult.data.map(normalizeHistoryRow)
        : [];
      const executions = Array.isArray(executionsResult.data)
        ? executionsResult.data.map(normalizePublicationExecution).filter((item): item is FounderEditorialHistoryRecord => item !== null)
        : [];
      const observations = Array.isArray(observationsResult.data)
        ? observationsResult.data.map(normalizeFounderAttestation).filter((item): item is FounderEditorialHistoryRecord => item !== null)
        : [];

      return [...experiments, ...executions, ...observations]
        .sort((left, right) => historyTime(right) - historyTime(left))
        .slice(0, limit);
    },
  };
}

async function defaultHistoryRepository(): Promise<FounderEditorialHistoryRepository> {
  const { supabase } = await import('./supabaseClient.js');
  return supabaseFounderEditorialHistoryRepository(supabase);
}

function historicalSemanticText(item: FounderEditorialHistoryRecord): string {
  return [item.coreThesis, item.primaryHook, item.angle, item.meaningfulChange ?? ''].filter(Boolean).join(' ');
}

function historicalPatternFingerprint(item: FounderEditorialHistoryRecord): string {
  return patternFingerprint({
    thesis: item.coreThesis,
    hook: item.primaryHook,
  });
}

function riskFor(score: number, exactPatternMatch: boolean, exactPublishedCopyMatch: boolean): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (exactPatternMatch || exactPublishedCopyMatch || score >= HIGH_SIMILARITY) return 'HIGH';
  if (score >= MEDIUM_SIMILARITY) return 'MEDIUM';
  return 'LOW';
}

export async function evaluateFounderEditorialNovelty({
  proposal,
  historyRepository,
}: {
  proposal: JsonRecord;
  historyRepository?: FounderEditorialHistoryRepository;
}): Promise<FounderEditorialNoveltyReceipt> {
  const identity = buildFounderEditorialIdentity(proposal);
  const roles = {
    promptos: 'editorial-pattern-grammar',
    chief: 'candidate-angle-proposal',
    fcr: 'history-readback-and-approval-gate',
  } as const;
  const authority = { publish: false, approve: false, schedule: false } as const;

  if (identity.platform !== 'linkedin') {
    const continuityCookie = hash({ identity, historyState: 'NOT_APPLICABLE', closestMatchId: null });
    return {
      contract: FOUNDER_EDITORIAL_NOVELTY_CONTRACT,
      allowed: true,
      risk: 'LOW',
      historyState: 'NOT_APPLICABLE',
      comparedCount: 0,
      closestMatchId: null,
      closestSimilarity: 0,
      storyFingerprint: identity.storyFingerprint,
      promptOsPatternFingerprint: identity.promptOsPatternFingerprint,
      chiefAngleFingerprint: identity.chiefAngleFingerprint,
      continuityCookie,
      roles,
      authority,
      reason: 'LinkedIn editorial-history comparison is not applicable to this platform.',
    };
  }

  const repository = historyRepository ?? await defaultHistoryRepository();
  const history = await repository.recentLinkedIn(MAX_HISTORY);
  if (history.length === 0) {
    const continuityCookie = hash({ identity, historyState: 'EMPTY', closestMatchId: null });
    return {
      contract: FOUNDER_EDITORIAL_NOVELTY_CONTRACT,
      allowed: true,
      risk: 'LOW',
      historyState: 'EMPTY',
      comparedCount: 0,
      closestMatchId: null,
      closestSimilarity: 0,
      storyFingerprint: identity.storyFingerprint,
      promptOsPatternFingerprint: identity.promptOsPatternFingerprint,
      chiefAngleFingerprint: identity.chiefAngleFingerprint,
      continuityCookie,
      roles,
      authority,
      reason: 'No published/analyzed LinkedIn history was available for comparison.',
    };
  }

  const currentSemanticText = `${identity.coreThesis} ${identity.hook}`;
  let closest: FounderEditorialHistoryRecord | null = null;
  let closestSimilarity = 0;
  let exactPatternMatch = false;
  let exactPublishedCopyMatch = false;
  for (const item of history) {
    const score = similarity(currentSemanticText, historicalSemanticText(item));
    if (score > closestSimilarity) {
      closest = item;
      closestSimilarity = score;
    }
    if (historicalPatternFingerprint(item) === identity.promptOsPatternFingerprint) {
      exactPatternMatch = true;
      closest ??= item;
    }
    const publicPayloadMatch = Boolean(
      item.publicPayloadHash
      && SHA256.test(item.publicPayloadHash)
      && item.publicPayloadHash.toLowerCase() === identity.publicPayloadHash,
    );
    const publicCopyMatch = Boolean(
      item.publicCopyHash
      && SHA256.test(item.publicCopyHash)
      && identity.publicCopyHashes.includes(item.publicCopyHash.toLowerCase()),
    );
    if (publicPayloadMatch || publicCopyMatch) {
      exactPublishedCopyMatch = true;
      closest = item;
    }
  }

  const risk = riskFor(closestSimilarity, exactPatternMatch, exactPublishedCopyMatch);
  const allowed = risk !== 'HIGH';
  const roundedSimilarity = Number(closestSimilarity.toFixed(4));
  const continuityCookie = hash({
    storyFingerprint: identity.storyFingerprint,
    promptOsPatternFingerprint: identity.promptOsPatternFingerprint,
    chiefAngleFingerprint: identity.chiefAngleFingerprint,
    closestMatchId: closest?.id ?? null,
    closestSimilarity: roundedSimilarity,
    exactPatternMatch,
    exactPublishedCopyMatch,
    risk,
    comparedCount: history.length,
  });

  return {
    contract: FOUNDER_EDITORIAL_NOVELTY_CONTRACT,
    allowed,
    risk,
    historyState: 'COMPARED',
    comparedCount: history.length,
    closestMatchId: closest?.id ?? null,
    closestSimilarity: roundedSimilarity,
    storyFingerprint: identity.storyFingerprint,
    promptOsPatternFingerprint: identity.promptOsPatternFingerprint,
    chiefAngleFingerprint: identity.chiefAngleFingerprint,
    continuityCookie,
    roles,
    authority,
    reason: allowed
      ? `Editorial novelty gate accepted the candidate at ${risk.toLowerCase()} repetition risk.`
      : exactPublishedCopyMatch
        ? 'Editorial novelty gate rejected public copy already present in successful publication or founder-attested history; Chief must select materially different copy before founder approval.'
        : 'Editorial novelty gate rejected a high-overlap thesis/hook pattern; Chief must select a materially different story angle before founder approval.',
  };
}
