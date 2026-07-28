export const FOUNDER_SIGNAL_CHANNELS = [
  'linkedin',
  'facebook',
  'instagram',
  'gmail',
] as const;

export type FounderSignalChannel = (typeof FOUNDER_SIGNAL_CHANNELS)[number];
export type FounderSignalDecision = 'auto-distribute' | 'review-only' | 'blocked';

export interface FounderSignalAutomationGrant {
  id: string;
  enabled: boolean;
  channels: FounderSignalChannel[];
  repositories: string[];
  audienceSegments: string[];
  expiresAt: string | null;
}

export interface FounderSignalCandidate {
  repository: string;
  channel: FounderSignalChannel;
  audienceSegment: string;
  proofUrl: string | null;
  sourceCommitSha: string | null;
  who: string | null;
  what: string | null;
  where: string | null;
  when: string | null;
  why: string | null;
  how: string | null;
  recipientId?: string | null;
  recipientSpecificWhy?: string | null;
}

export interface FounderSignalPolicyResult {
  decision: FounderSignalDecision;
  reasons: string[];
  grantId: string;
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

export function evaluateFounderSignalAutomation(
  grant: FounderSignalAutomationGrant,
  candidate: FounderSignalCandidate,
  now = new Date(),
): FounderSignalPolicyResult {
  const reasons: string[] = [];

  if (!grant.enabled) reasons.push('automation grant is disabled');
  if (isExpired(grant.expiresAt, now)) reasons.push('automation grant is expired or invalid');
  if (!grant.channels.includes(candidate.channel)) reasons.push('channel is outside the grant scope');
  if (!grant.repositories.includes(candidate.repository)) {
    reasons.push('repository is outside the grant scope');
  }
  if (!grant.audienceSegments.includes(candidate.audienceSegment)) {
    reasons.push('audience segment is outside the grant scope');
  }

  if (!hasText(candidate.proofUrl)) reasons.push('proof URL is required');
  if (!candidate.sourceCommitSha || !COMMIT_SHA_PATTERN.test(candidate.sourceCommitSha)) {
    reasons.push('an exact 40-character source commit SHA is required');
  }

  const fiveW1h = [
    ['who', candidate.who],
    ['what', candidate.what],
    ['where', candidate.where],
    ['when', candidate.when],
    ['why', candidate.why],
    ['how', candidate.how],
  ] as const;
  for (const [field, value] of fiveW1h) {
    if (!hasText(value)) reasons.push(`${field} is required`);
  }

  if (candidate.channel === 'gmail') {
    if (!hasText(candidate.recipientId)) reasons.push('investor recipient ID is required');
    if (!hasText(candidate.recipientSpecificWhy)) {
      reasons.push('recipient-specific why is required for investor email');
    }
  }

  if (reasons.length === 0) {
    return { decision: 'auto-distribute', reasons: [], grantId: grant.id };
  }

  const hardBlock = reasons.some(
    (reason) =>
      reason.includes('disabled') ||
      reason.includes('expired') ||
      reason.includes('outside the grant scope'),
  );

  return {
    decision: hardBlock ? 'blocked' : 'review-only',
    reasons,
    grantId: grant.id,
  };
}
