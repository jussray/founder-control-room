export const FOUNDER_SIGNAL_CHANNELS = [
  'linkedin',
  'facebook',
  'instagram',
  'gmail',
] as const;

export type FounderSignalChannel = (typeof FOUNDER_SIGNAL_CHANNELS)[number];
export type FounderSignalDecision = 'auto-distribute' | 'review-only' | 'blocked';
export type FounderSignalEvidenceProvider = 'github' | 'cloudflare';

export interface FounderSignalRouteGrant {
  channel: FounderSignalChannel;
  audienceSegment: string;
}

export interface FounderSignalAutomationGrant {
  id: string;
  enabled: boolean;
  routes: FounderSignalRouteGrant[];
  repositories: string[];
  approvedRecipientIds: string[];
  expiresAt: string | null;
}

export interface FounderSignalEvidenceReceipt {
  verified: boolean;
  provider: FounderSignalEvidenceProvider;
  repository: string;
  sourceCommitSha: string;
  proofUrl: string;
}

export interface FounderSignalCandidate {
  repository: string;
  channel: FounderSignalChannel;
  audienceSegment: string;
  proofUrl: string | null;
  sourceCommitSha: string | null;
  evidenceReceipt: FounderSignalEvidenceReceipt | null;
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

function routeIsApproved(
  grant: FounderSignalAutomationGrant,
  candidate: FounderSignalCandidate,
): boolean {
  return grant.routes.some(
    (route) =>
      route.channel === candidate.channel &&
      route.audienceSegment === candidate.audienceSegment,
  );
}

function evidenceIsBound(candidate: FounderSignalCandidate): boolean {
  const receipt = candidate.evidenceReceipt;
  if (!receipt?.verified) return false;
  if (!hasText(candidate.proofUrl) || !hasText(receipt.proofUrl)) return false;
  if (!candidate.sourceCommitSha || !COMMIT_SHA_PATTERN.test(candidate.sourceCommitSha)) {
    return false;
  }
  return (
    receipt.repository === candidate.repository &&
    receipt.sourceCommitSha.toLowerCase() === candidate.sourceCommitSha.toLowerCase() &&
    receipt.proofUrl === candidate.proofUrl
  );
}

export function evaluateFounderSignalAutomation(
  grant: FounderSignalAutomationGrant,
  candidate: FounderSignalCandidate,
  now = new Date(),
): FounderSignalPolicyResult {
  const reasons: string[] = [];

  if (!grant.enabled) reasons.push('automation grant is disabled');
  if (isExpired(grant.expiresAt, now)) reasons.push('automation grant is expired or invalid');
  if (!grant.repositories.includes(candidate.repository)) {
    reasons.push('repository is outside the grant scope');
  }
  if (!routeIsApproved(grant, candidate)) {
    reasons.push('channel and audience route is outside the grant scope');
  }

  if (!hasText(candidate.proofUrl)) reasons.push('proof URL is required');
  if (!candidate.sourceCommitSha || !COMMIT_SHA_PATTERN.test(candidate.sourceCommitSha)) {
    reasons.push('an exact 40-character source commit SHA is required');
  }
  if (!evidenceIsBound(candidate)) {
    reasons.push('trusted evidence receipt must match repository, commit, and proof URL');
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
    const recipientId = candidate.recipientId?.trim() ?? '';
    if (!recipientId) {
      reasons.push('investor recipient ID is required');
    } else if (!grant.approvedRecipientIds.includes(recipientId)) {
      reasons.push('investor recipient is outside the approved grant scope');
    }
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
