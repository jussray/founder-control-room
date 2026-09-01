import type { SupabaseClient } from '@supabase/supabase-js';

type JsonRecord = Record<string, unknown>;

export const FOUNDER_CONTENT_FINGERPRINT_GATE_CONTRACT = 'fcr/founder-content-fingerprint-gate@v1' as const;
const MAX_HISTORY = 32;
const HIGH_SIMILARITY = 0.55;

export type FounderContentFormat = 'VIDEO' | 'IMAGE' | 'TEXT';

export interface FounderContentFingerprintHistoryRecord {
  id: string;
  platform: string;
  project: string | null;
  thesis: string;
  hook: string;
  topic: string;
  angle: string;
  cta: string;
  format: FounderContentFormat | null;
  publishDate: string | null;
  status: string;
  performance: {
    impressions: number | null;
    profileViews: number | null;
    engagementRate: number | null;
    meaningfulComments: number | null;
    saves: number | null;
    shares: number | null;
    followerMovement: number | null;
    qualifiedConversations: number | null;
  };
}

export interface FounderContentFingerprintHistory {
  records: FounderContentFingerprintHistoryRecord[];
  coverage: {
    linkedin: boolean;
    otherSocial: boolean;
    formatHistory: boolean;
  };
}

export interface FounderContentFingerprintHistoryRepository {
  recent(limit: number): Promise<FounderContentFingerprintHistory>;
}

export interface FounderContentFingerprintCandidate {
  project: string;
  platform: string;
  topic: string;
  differentiatedThesis: string;
  format: FounderContentFormat | null;
  formatRationale: string;
}

export interface FounderContentFingerprintPacket {
  contract: typeof FOUNDER_CONTENT_FINGERPRINT_GATE_CONTRACT;
  gate: 'PASS' | 'HOLD';
  candidate: FounderContentFingerprintCandidate;
  recent: {
    hooks: string[];
    topics: string[];
    ctas: string[];
    formats: FounderContentFormat[];
    performanceSignals: Array<{
      id: string;
      platform: string;
      impressions: number | null;
      profileViews: number | null;
      engagementRate: number | null;
      meaningfulComments: number | null;
      saves: number | null;
      shares: number | null;
      followerMovement: number | null;
      qualifiedConversations: number | null;
    }>;
  };
  ruledOutAngles: Array<{
    id: string;
    platform: string;
    angle: string;
    similarity: number;
    reason: 'RECENTLY_USED' | 'HIGH_THESIS_OVERLAP';
  }>;
  coverage: FounderContentFingerprintHistory['coverage'];
  closestMatchId: string | null;
  closestSimilarity: number;
  reasons: string[];
  authority: {
    draft: false;
    approve: false;
    schedule: false;
    publish: false;
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter((token) => token.length > 2));
}

function similarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function asFormat(value: unknown): FounderContentFormat | null {
  const normalized = text(value).toUpperCase();
  return normalized === 'VIDEO' || normalized === 'IMAGE' || normalized === 'TEXT'
    ? normalized
    : null;
}

function normalizeLinkedInExperiment(value: unknown): FounderContentFingerprintHistoryRecord {
  const row = record(value);
  return {
    id: text(row.id),
    platform: 'linkedin',
    project: text(row.related_project) || null,
    thesis: text(row.core_thesis),
    hook: text(row.primary_hook),
    topic: text(row.angle) || text(row.core_thesis),
    angle: text(row.angle) || text(row.core_thesis),
    cta: text(row.cta),
    format: asFormat(row.format),
    publishDate: text(row.publish_date) || null,
    status: text(row.status),
    performance: {
      impressions: numberOrNull(row.impressions),
      profileViews: numberOrNull(row.profile_views),
      engagementRate: numberOrNull(row.engagement_rate),
      meaningfulComments: numberOrNull(row.meaningful_comments),
      saves: numberOrNull(row.saves),
      shares: numberOrNull(row.shares),
      followerMovement: numberOrNull(row.follower_movement),
      qualifiedConversations: numberOrNull(row.qualified_conversations),
    },
  };
}

export function supabaseFounderContentFingerprintHistoryRepository(
  client: SupabaseClient,
): FounderContentFingerprintHistoryRepository {
  return {
    async recent(limit) {
      const result = await client
        .from('linkedin_experiments')
        .select('id, related_project, core_thesis, primary_hook, angle, cta, publish_date, status, impressions, profile_views, engagement_rate, meaningful_comments, saves, shares, follower_movement, qualified_conversations')
        .in('status', ['published', 'analyzed'])
        .order('publish_date', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (result.error) {
        throw new Error(`founder-content fingerprint history readback failed: ${result.error.message}`);
      }

      const records = Array.isArray(result.data)
        ? result.data.map(normalizeLinkedInExperiment)
        : [];

      return {
        records,
        coverage: {
          linkedin: true,
          otherSocial: false,
          formatHistory: records.some((item) => item.format !== null),
        },
      };
    },
  };
}

async function defaultHistoryRepository(): Promise<FounderContentFingerprintHistoryRepository> {
  const { supabase } = await import('./supabaseClient.js');
  return supabaseFounderContentFingerprintHistoryRepository(supabase);
}

export function evaluateFounderContentFingerprintHistory(
  candidate: FounderContentFingerprintCandidate,
  history: FounderContentFingerprintHistory,
): FounderContentFingerprintPacket {
  const reasons: string[] = [];
  const thesis = text(candidate.differentiatedThesis);
  const formatRationale = text(candidate.formatRationale);
  const candidateSemantic = `${text(candidate.topic)} ${thesis}`;

  if (!history.coverage.linkedin) reasons.push('Recent LinkedIn history has not been checked.');
  if (!history.coverage.otherSocial) reasons.push('Recent non-LinkedIn social history has not been checked.');
  if (!thesis) reasons.push('One differentiated thesis is required before drafting.');
  if (!candidate.format) reasons.push('A deliberate VIDEO, IMAGE, or TEXT format choice is required before drafting.');
  if (candidate.format && !formatRationale) reasons.push('The format choice requires an explicit rationale before drafting.');

  let closestMatchId: string | null = null;
  let closestSimilarity = 0;
  const ruledOutAngles: FounderContentFingerprintPacket['ruledOutAngles'] = [];

  for (const item of history.records) {
    const historicalSemantic = `${item.topic} ${item.thesis} ${item.angle}`;
    const score = similarity(candidateSemantic, historicalSemantic);
    if (score > closestSimilarity) {
      closestSimilarity = score;
      closestMatchId = item.id;
    }

    const angle = item.angle || item.thesis || item.topic;
    if (angle) {
      ruledOutAngles.push({
        id: item.id,
        platform: item.platform,
        angle,
        similarity: Number(score.toFixed(4)),
        reason: score >= HIGH_SIMILARITY ? 'HIGH_THESIS_OVERLAP' : 'RECENTLY_USED',
      });
    }
  }

  const roundedSimilarity = Number(closestSimilarity.toFixed(4));
  if (roundedSimilarity >= HIGH_SIMILARITY) {
    reasons.push('The proposed thesis/topic overlaps too strongly with a recently used angle.');
  }

  const recentFormats = history.records
    .map((item) => item.format)
    .filter((item): item is FounderContentFormat => item !== null);

  const packet: FounderContentFingerprintPacket = {
    contract: FOUNDER_CONTENT_FINGERPRINT_GATE_CONTRACT,
    gate: reasons.length === 0 ? 'PASS' : 'HOLD',
    candidate: {
      project: text(candidate.project),
      platform: text(candidate.platform).toLowerCase(),
      topic: text(candidate.topic),
      differentiatedThesis: thesis,
      format: candidate.format,
      formatRationale,
    },
    recent: {
      hooks: unique(history.records.map((item) => item.hook)),
      topics: unique(history.records.map((item) => item.topic)),
      ctas: unique(history.records.map((item) => item.cta)),
      formats: [...new Set(recentFormats)],
      performanceSignals: history.records.map((item) => ({
        id: item.id,
        platform: item.platform,
        ...item.performance,
      })),
    },
    ruledOutAngles,
    coverage: history.coverage,
    closestMatchId,
    closestSimilarity: roundedSimilarity,
    reasons,
    authority: {
      draft: false,
      approve: false,
      schedule: false,
      publish: false,
    },
  };

  return packet;
}

export async function evaluateFounderContentFingerprintGate({
  candidate,
  historyRepository,
}: {
  candidate: FounderContentFingerprintCandidate;
  historyRepository?: FounderContentFingerprintHistoryRepository;
}): Promise<FounderContentFingerprintPacket> {
  const repository = historyRepository ?? await defaultHistoryRepository();
  const history = await repository.recent(MAX_HISTORY);
  return evaluateFounderContentFingerprintHistory(candidate, history);
}
