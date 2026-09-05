import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-expect-error -- canonical founder-content authority is the provider-neutral CommonJS firewall contract.
import founderContentAuthorizationContract from '../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';

type JsonRecord = Record<string, unknown>;

interface CanonicalFounderContentIdentity {
  canonicalChiefIdentity(proposal: JsonRecord): {
    public_payload: { draft_text: string; public_claims: Array<{ text: string }> };
  };
}

const canonicalFounderContent = founderContentAuthorizationContract as CanonicalFounderContentIdentity;

export const FOUNDER_EDITORIAL_NOVELTY_CONTRACT = 'fcr/founder-editorial-novelty@v1' as const;
const EDITORIAL_PATTERN_LANE = 'founder-editorial';
const MAX_HISTORY = 32;
const HIGH_SIMILARITY = 0.55;
const MEDIUM_SIMILARITY = 0.35;
const SHA256 = /^[0-9a-f]{64}$/i;
const DIRECT_PUBLISH_ACTION = 'publish_founder_content';
const DIRECT_PUBLISH_CONTRACT = 'fcr/first-party-founder-content-publish@v1';

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
  promptOsPatternFingerprint?: string | null;
  publicPayloadHash?: string | null;
  publicCopyHash?: string | null;
  historySource?: 'experiment' | 'attestation' | 'provider_readback';
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
  publicCopyFingerprint: string;
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
  publicCopyFingerprint: string;
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

export function founderEditorialPatternFingerprint({ thesis, hook }: { thesis: string; hook: string }): string {
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
  // canonicalChiefIdentity() truncates each public_claims[].text to the
  // 500-char canonical bound (and draft_text to 3000) before it is
  // authorized/published. Deriving the novelty thesis from the raw proposal
  // instead would let a caller pad a claim past that bound with unique
  // filler that never gets authorized or published, diluting the Jaccard
  // similarity and pattern fingerprint enough for a genuinely repeated
  // thesis to slip past the repetition gate. Compute it once and reuse it
  // for the reservation-identity draft below too.
  const canonicalPayload = canonicalFounderContent.canonicalChiefIdentity(proposal).public_payload;
  const claims = publicClaimsText(canonicalPayload as unknown as JsonRecord);
  const hook = firstHook(draft);
  const coreThesis = claims || draft.slice(0, 600);
  const eventRef = text(evidence.ref);
  const proofDigest = text(evidence.digest).toLowerCase();
  const project = canonicalLane(sourceRepo);
  const platform = text(payload.platform).toLowerCase();
  const publicPayloadHash = hash(payload);
  const publicCopyHashes = founderEditorialPublicCopyHashes(draft);
  // Bound to the exact text the provider actually publishes, never
  // public_claims — those are evidence metadata, not published copy, so two
  // proposals that publish identical text but carry different claims must
  // still resolve to the same canonical copy identity for approval
  // reservation. promptOsPatternFingerprint below intentionally prefers
  // claims for thesis-level repetition detection, which is a different
  // concern from "is this the same public copy". Derived from
  // canonicalChiefIdentity()'s draft_text (not the raw draft above): the
  // authorization contract truncates draft_text to 3000 chars before
  // hashing/publishing, so two proposals whose raw drafts diverge only past
  // that bound still authorize and publish byte-identical text and must
  // collide here too. Hashed exact (not normalize()'d): this fingerprint is
  // a reservation identity key, not a semantic-similarity input, so two
  // proposals whose published text differs only in case/punctuation/
  // whitespace are still distinct publishable copy and must NOT collide —
  // normalize() would let the second one's approval get wrongly blocked as
  // an already-reserved duplicate.
  const canonicalDraft = text(canonicalPayload.draft_text);
  const publicCopyFingerprint = digestText(canonicalDraft);

  const promptOsPatternFingerprint = founderEditorialPatternFingerprint({
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
    publicCopyFingerprint,
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
    promptOsPatternFingerprint: null,
    publicPayloadHash: null,
    publicCopyHash: null,
    historySource: 'experiment',
  };
}

function normalizeFounderAttestation(value: unknown): FounderEditorialHistoryRecord | null {
  const row = record(value);
  const observedState = record(row.observed_state);
  const publication = record(observedState.publication);
  const editorialMemory = record(observedState.editorialMemory);
  const promptOsPatternFingerprint = text(editorialMemory.promptOsPatternFingerprint).toLowerCase();
  if (
    text(observedState.platform).toLowerCase() !== 'linkedin'
    || text(publication.state) !== 'USER_ATTESTED'
    || text(editorialMemory.state) !== 'USER_ATTESTED_PATTERN'
    || !SHA256.test(promptOsPatternFingerprint)
  ) return null;

  return {
    id: `attestation:${text(row.resource_id)}`,
    relatedProject: null,
    coreThesis: '',
    primaryHook: '',
    angle: '',
    meaningfulChange: null,
    hookType: null,
    proofStyle: 'founder-attested-editorial-pattern',
    publishDate: text(publication.publishedAt) || text(row.observed_at) || null,
    status: 'published',
    promptOsPatternFingerprint,
    publicPayloadHash: null,
    publicCopyHash: null,
    historySource: 'attestation',
  };
}

function approvalPatternMap(value: unknown): Map<string, string> {
  const patterns = new Map<string, string>();
  if (!Array.isArray(value)) return patterns;
  for (const item of value) {
    const row = record(item);
    const approvalId = text(row.approval_id).toLowerCase();
    const pattern = text(row.pattern_fingerprint).toLowerCase();
    if (approvalId && SHA256.test(pattern)) patterns.set(approvalId, pattern);
  }
  return patterns;
}

function normalizeProviderReadback(
  value: unknown,
  patterns: Map<string, string>,
): FounderEditorialHistoryRecord | null {
  const row = record(value);
  const request = record(row.request);
  const result = record(row.result);
  const approvalId = text(request.approvalId).toLowerCase();
  const promptOsPatternFingerprint = patterns.get(approvalId) ?? '';
  const publishedAt = text(result.publishedAt);
  const externalPostId = text(result.externalPostId);
  const permalink = text(result.permalink);
  const publicPayloadHash = text(request.publicPayloadHash).toLowerCase();

  if (
    text(row.action_type) !== DIRECT_PUBLISH_ACTION
    || text(row.status) !== 'succeeded'
    || row.success !== true
    || text(result.contract) !== DIRECT_PUBLISH_CONTRACT
    || text(result.truthState) !== 'PUBLISHED'
    || result.published !== true
    || text(result.platform).toLowerCase() !== 'linkedin'
    || !externalPostId.startsWith('urn:li:')
    || !permalink.startsWith('https://www.linkedin.com/feed/update/urn:li:')
    || !Number.isFinite(Date.parse(publishedAt))
    || !SHA256.test(promptOsPatternFingerprint)
  ) return null;

  return {
    id: `provider-readback:${externalPostId}`,
    relatedProject: null,
    coreThesis: '',
    primaryHook: '',
    angle: '',
    meaningfulChange: null,
    hookType: null,
    proofStyle: 'provider-verified-editorial-pattern',
    publishDate: new Date(publishedAt).toISOString(),
    status: 'published',
    promptOsPatternFingerprint,
    publicPayloadHash: SHA256.test(publicPayloadHash) ? publicPayloadHash : null,
    publicCopyHash: null,
    historySource: 'provider_readback',
  };
}

function historyTime(value: FounderEditorialHistoryRecord): number {
  const parsed = value.publishDate ? Date.parse(value.publishDate) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function supabaseFounderEditorialHistoryRepository(client: SupabaseClient): FounderEditorialHistoryRepository {
  return {
    async recentLinkedIn(limit) {
      const [experimentsResult, observationsResult, executionsResult, patternReservationsResult] = await Promise.all([
        client
          .from('linkedin_experiments')
          .select('id, related_project, core_thesis, primary_hook, angle, meaningful_change, hook_type, proof_style, publish_date, status')
          .in('status', ['published', 'analyzed'])
          .order('publish_date', { ascending: false, nullsFirst: false })
          .limit(limit),
        client
          .from('provider_observations')
          .select('resource_id, observed_state, observed_at')
          .in('provider', ['linkedin'])
          .in('resource_type', ['founder_content_post'])
          .order('observed_at', { ascending: false, nullsFirst: false })
          .limit(limit),
        client
          .from('approval_executions')
          .select('id, action_type, status, success, request, result, executed_at')
          .eq('action_type', DIRECT_PUBLISH_ACTION)
          .eq('status', 'succeeded')
          .eq('success', true)
          .order('executed_at', { ascending: false, nullsFirst: false })
          .limit(limit),
        client
          .from('founder_content_active_editorial_pattern_reservations')
          .select('approval_id, pattern_fingerprint, reserved_at, expires_at')
          .order('reserved_at', { ascending: false, nullsFirst: false })
          .limit(limit),
      ]);

      if (experimentsResult.error) {
        throw new Error(`editorial experiment history readback failed: ${experimentsResult.error.message}`);
      }
      if (observationsResult.error) {
        throw new Error(`editorial founder-attestation history readback failed: ${observationsResult.error.message}`);
      }
      if (executionsResult.error) {
        throw new Error(`editorial provider-readback execution history failed: ${executionsResult.error.message}`);
      }
      if (patternReservationsResult.error) {
        throw new Error(`editorial approval-pattern history readback failed: ${patternReservationsResult.error.message}`);
      }

      const experiments = Array.isArray(experimentsResult.data)
        ? experimentsResult.data.map(normalizeHistoryRow)
        : [];
      const observations = Array.isArray(observationsResult.data)
        ? observationsResult.data.map(normalizeFounderAttestation).filter((item): item is FounderEditorialHistoryRecord => item !== null)
        : [];
      const patterns = approvalPatternMap(patternReservationsResult.data);
      const providerReadbacks = Array.isArray(executionsResult.data)
        ? executionsResult.data
          .map((item) => normalizeProviderReadback(item, patterns))
          .filter((item): item is FounderEditorialHistoryRecord => item !== null)
        : [];

      return [...experiments, ...observations, ...providerReadbacks]
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
  const persisted = text(item.promptOsPatternFingerprint).toLowerCase();
  if (SHA256.test(persisted)) return persisted;
  return founderEditorialPatternFingerprint({
    thesis: item.coreThesis,
    hook: item.primaryHook,
  });
}

function riskFor(score: number, exactPatternMatch: boolean): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (exactPatternMatch || score >= HIGH_SIMILARITY) return 'HIGH';
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
      publicCopyFingerprint: identity.publicCopyFingerprint,
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
      publicCopyFingerprint: identity.publicCopyFingerprint,
      chiefAngleFingerprint: identity.chiefAngleFingerprint,
      continuityCookie,
      roles,
      authority,
      reason: 'No published/analyzed, founder-attested, or provider-verified LinkedIn pattern history was available for comparison.',
    };
  }

  const currentSemanticText = `${identity.coreThesis} ${identity.hook}`;
  let closest: FounderEditorialHistoryRecord | null = null;
  let closestSimilarity = 0;
  let exactPatternMatch = false;
  let exactMatch: FounderEditorialHistoryRecord | null = null;
  for (const item of history) {
    const score = similarity(currentSemanticText, historicalSemanticText(item));
    if (score > closestSimilarity) {
      closest = item;
      closestSimilarity = score;
    }
    if (historicalPatternFingerprint(item) === identity.promptOsPatternFingerprint) {
      exactPatternMatch = true;
      exactMatch ??= item;
    }
  }
  // An exact pattern match always forces HIGH risk (see riskFor below), so
  // whenever one is present it — not a merely higher-token-similarity but
  // unrelated record — must be what closestMatchId/the continuity receipt
  // point to; otherwise the audit trail names the wrong record as the
  // reason for the block. closestSimilarity is left as the best raw
  // token-overlap score found, a separate metric from which record is
  // attributed as the match.
  if (exactMatch) closest = exactMatch;

  const risk = riskFor(closestSimilarity, exactPatternMatch);
  const allowed = risk !== 'HIGH';
  const roundedSimilarity = Number(closestSimilarity.toFixed(4));
  const continuityCookie = hash({
    storyFingerprint: identity.storyFingerprint,
    promptOsPatternFingerprint: identity.promptOsPatternFingerprint,
    chiefAngleFingerprint: identity.chiefAngleFingerprint,
    closestMatchId: closest?.id ?? null,
    closestSimilarity: roundedSimilarity,
    exactPatternMatch,
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
    publicCopyFingerprint: identity.publicCopyFingerprint,
    chiefAngleFingerprint: identity.chiefAngleFingerprint,
    continuityCookie,
    roles,
    authority,
    reason: allowed
      ? `Editorial novelty gate accepted the candidate at ${risk.toLowerCase()} repetition risk.`
      : 'Editorial novelty gate rejected a high-overlap or already-published thesis/hook pattern; Chief must select a materially different story angle before founder approval.',
  };
}
