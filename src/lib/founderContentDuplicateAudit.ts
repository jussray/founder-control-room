export const FOUNDER_CONTENT_DUPLICATE_AUDIT_CONTRACT = 'fcr/founder-content-duplicate-audit@v1' as const;

const DEFAULT_SIMILARITY_THRESHOLD = 0.82;
const SHINGLE_SIZE = 3;

/**
 * The minimum a caller must know about one already-drafted/posted item to
 * audit a new candidate against it. Deliberately decoupled from
 * `StoredFounderContentPost` so this module stays pure and has no database
 * dependency — the caller supplies whatever history it already has.
 */
export interface PriorPostSummary {
  postId: string;
  platform: string;
  sourceRepository: string;
  text: string;
  /** A rejected draft was never actually said publicly; it is not "already posted". */
  status?: string | null;
}

export interface DuplicatePostAuditResult {
  contract: typeof FOUNDER_CONTENT_DUPLICATE_AUDIT_CONTRACT;
  isDuplicate: boolean;
  matchedPostId: string | null;
  similarity: number;
  reason: string;
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    // Proof links are legitimately repeated across distinct, non-duplicate posts.
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(normalized: string, size: number = SHINGLE_SIZE): Set<string> {
  const words = normalized.split(' ').filter(Boolean);
  const result = new Set<string>();
  if (words.length === 0) return result;
  if (words.length < size) {
    result.add(words.join(' '));
    return result;
  }
  for (let index = 0; index <= words.length - size; index += 1) {
    result.add(words.slice(index, index + size).join(' '));
  }
  return result;
}

/**
 * Containment similarity: the fraction of the SMALLER shingle set found in
 * the larger one. A repost often keeps the bulk of the original wording and
 * only adds or trims a little, which plain (symmetric) Jaccard similarity
 * under-scores as the added material grows the union. Containment catches
 * "same core content, slightly expanded" the way a duplicate-post audit
 * needs to, while two texts that only share a few incidental words still
 * score low because few of either side's shingles appear in the other.
 */
function containmentSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let intersection = 0;
  for (const item of smaller) {
    if (larger.has(item)) intersection += 1;
  }
  return intersection / smaller.size;
}

/**
 * Audits one candidate post's text against prior drafted/posted items so the
 * same progress never gets posted twice under different wording. Pure and
 * deterministic — no network call, no persistence, no provider authority.
 *
 * A rejected prior post is excluded: it was never actually published, so a
 * new candidate resembling it is not a duplicate of anything a reader saw.
 */
export function auditForDuplicatePost(
  candidateText: string,
  priorPosts: readonly PriorPostSummary[],
  options: { similarityThreshold?: number } = {},
): DuplicatePostAuditResult {
  const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const candidateNormalized = normalizeForComparison(candidateText);

  if (!candidateNormalized) {
    return {
      contract: FOUNDER_CONTENT_DUPLICATE_AUDIT_CONTRACT,
      isDuplicate: false,
      matchedPostId: null,
      similarity: 0,
      reason: 'candidate text has no comparable content once URLs and punctuation are stripped',
    };
  }

  const candidateShingles = shingles(candidateNormalized);

  let best: { postId: string; similarity: number } | null = null;
  for (const prior of priorPosts) {
    if (prior.status === 'rejected') continue;
    const priorNormalized = normalizeForComparison(prior.text);
    if (!priorNormalized) continue;
    const similarity = candidateNormalized === priorNormalized
      ? 1
      : containmentSimilarity(candidateShingles, shingles(priorNormalized));
    if (!best || similarity > best.similarity) {
      best = { postId: prior.postId, similarity };
    }
  }

  if (!best) {
    return {
      contract: FOUNDER_CONTENT_DUPLICATE_AUDIT_CONTRACT,
      isDuplicate: false,
      matchedPostId: null,
      similarity: 0,
      reason: 'no prior posts were supplied to audit against',
    };
  }

  const isDuplicate = best.similarity >= threshold;
  return {
    contract: FOUNDER_CONTENT_DUPLICATE_AUDIT_CONTRACT,
    isDuplicate,
    matchedPostId: isDuplicate ? best.postId : null,
    similarity: best.similarity,
    reason: isDuplicate
      ? `candidate text is ${(best.similarity * 100).toFixed(0)}% similar to already-posted content (postId ${best.postId})`
      : 'no prior post matched above the duplicate-similarity threshold',
  };
}
