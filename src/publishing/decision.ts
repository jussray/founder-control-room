import type { ProofEngineSnapshot } from '../proof-engine/readiness.js';

export type PublishingDestinationMode = 'draft' | 'queue' | 'publish';
export type PublishingDecisionStatus =
  | 'blocked'
  | 'draft_ready'
  | 'approval_required'
  | 'authorized';

export type PublishingAudience =
  | 'customers'
  | 'investors'
  | 'founders'
  | 'developers'
  | 'partners'
  | 'community'
  | 'internal';

export type PublishingPlatform =
  | 'linkedin'
  | 'facebook_founder'
  | 'facebook_brand'
  | 'instagram'
  | 'threads'
  | 'x'
  | 'bluesky'
  | 'email';

export type TractionKind =
  | 'adoption'
  | 'revenue'
  | 'conversion'
  | 'audience_growth'
  | 'retention'
  | 'qualified_interest';

export interface TractionSignal {
  id: string;
  kind: TractionKind;
  label: string;
  value: string;
  sourceUrl: string;
}

export interface GovernanceAdvantage {
  id: string;
  label: string;
  proofUrl: string;
}

export interface PublishingIntent {
  projectSlug: string;
  eventId: string;
  summary: string;
  requestedMode: PublishingDestinationMode;
  audiences: PublishingAudience[];
  platforms: PublishingPlatform[];
  traction: TractionSignal[];
  governanceAdvantages: GovernanceAdvantage[];
  founderApprovalId?: string | null;
}

export interface PublishingContentRoute {
  platform: PublishingPlatform;
  contentField:
    | 'linkedin_draft'
    | 'facebook_founder_draft'
    | 'facebook_brand_draft'
    | 'instagram_draft'
    | 'threads_draft'
    | 'x_draft'
    | 'bluesky_draft'
    | 'email_draft';
}

export interface PublishingDecision {
  projectSlug: string;
  eventId: string;
  status: PublishingDecisionStatus;
  requestedMode: PublishingDestinationMode;
  recommendedMode: 'internal_only' | PublishingDestinationMode;
  publishAllowed: boolean;
  blockers: string[];
  warnings: string[];
  proofUrls: string[];
  contentRoutes: PublishingContentRoute[];
}

const CONTENT_FIELD_BY_PLATFORM: Record<
  PublishingPlatform,
  PublishingContentRoute['contentField']
> = {
  linkedin: 'linkedin_draft',
  facebook_founder: 'facebook_founder_draft',
  facebook_brand: 'facebook_brand_draft',
  instagram: 'instagram_draft',
  threads: 'threads_draft',
  x: 'x_draft',
  bluesky: 'bluesky_draft',
  email: 'email_draft',
};

function isPublicHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function buildPublishingDecision(
  proof: ProofEngineSnapshot,
  intent: PublishingIntent,
): PublishingDecision {
  const platforms = unique(intent.platforms);
  const proofUrls = unique([
    ...proof.signals.flatMap((signal) => signal.evidence),
    ...intent.traction.map((signal) => signal.sourceUrl),
    ...intent.governanceAdvantages.map((advantage) => advantage.proofUrl),
  ].filter(isPublicHttpUrl));

  const verifiedTraction = intent.traction.filter(
    (signal) => signal.label.trim() && signal.value.trim() && isPublicHttpUrl(signal.sourceUrl),
  );
  const verifiedGovernance = intent.governanceAdvantages.filter(
    (advantage) => advantage.label.trim() && isPublicHttpUrl(advantage.proofUrl),
  );

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (proof.projectSlug !== intent.projectSlug) {
    blockers.push('proof snapshot and publishing intent belong to different projects');
  }
  if (!intent.summary.trim()) blockers.push('missing founder-readable event summary');
  if (intent.audiences.length === 0) blockers.push('missing target audience');
  if (platforms.length === 0) blockers.push('missing destination platform');
  if (proof.status === 'blocked') {
    blockers.push(...proof.blockers.map((blocker) => `proof blocked: ${blocker}`));
  }
  if (proofUrls.length === 0) blockers.push('missing clickable proof');
  if (verifiedTraction.length === 0) {
    blockers.push('missing verified traction; execution activity must not be relabeled as traction');
  }
  if (verifiedGovernance.length === 0) blockers.push('missing governance advantage with proof');

  if (proof.status === 'conditional') {
    warnings.push('proof is conditional; public queue or publish must remain disabled');
  }
  if (proof.signals.some((signal) => signal.checkedAt === null)) {
    warnings.push('one or more proof signals have no checked timestamp');
  }

  const contentRoutes = platforms.map((platform) => ({
    platform,
    contentField: CONTENT_FIELD_BY_PLATFORM[platform],
  }));

  const base = {
    projectSlug: intent.projectSlug,
    eventId: intent.eventId,
    requestedMode: intent.requestedMode,
    blockers,
    warnings,
    proofUrls,
    contentRoutes,
  };

  if (blockers.length > 0) {
    return {
      ...base,
      status: 'blocked',
      recommendedMode: 'internal_only',
      publishAllowed: false,
    };
  }

  if (proof.status !== 'ready' || intent.requestedMode === 'draft') {
    return {
      ...base,
      status: 'draft_ready',
      recommendedMode: 'draft',
      publishAllowed: false,
    };
  }

  if (!intent.founderApprovalId?.trim()) {
    return {
      ...base,
      status: 'approval_required',
      recommendedMode: 'draft',
      publishAllowed: false,
    };
  }

  return {
    ...base,
    status: 'authorized',
    recommendedMode: intent.requestedMode,
    publishAllowed: true,
  };
}
