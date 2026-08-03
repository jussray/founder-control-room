import type {
  FounderOsLabEvidence,
  FounderOsLabEvidenceField,
  FounderOsLabProviderId,
  FounderOsLabRequest,
} from './contracts.js';

interface ProviderEvidenceContext extends FounderOsLabEvidence {
  projectId?: string;
  automationId?: string;
  workspaceId?: string;
  recordIds?: string[];
  associationPlan?: string;
}

/**
 * Concrete evidence fields that must exist before a mutating preview may be
 * described as ready for a separately governed external executor.
 *
 * Provider and destination receipts remain post-execution evidence and are
 * intentionally not treated as preflight inputs.
 */
export const FOUNDER_OS_LAB_PROVIDER_PREFLIGHT_EVIDENCE: Readonly<
  Record<FounderOsLabProviderId, readonly FounderOsLabEvidenceField[]>
> = {
  chatgpt: [],
  claude: [],
  codex: ['repository', 'commitSha', 'proofUrls'],
  perplexity: [],
  github: ['repository', 'commitSha', 'proofUrls'],
  supabase: ['repository', 'commitSha', 'proofUrls'],
  cloudflare: ['repository', 'commitSha', 'proofUrls'],
  zapier: ['repository', 'commitSha', 'proofUrls'],
  figma: [],
  'openai-platform': [],
  hubspot: ['proofUrls'],
} as const;

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function providerContext(request: FounderOsLabRequest): ProviderEvidenceContext {
  return (request.evidence ?? {}) as ProviderEvidenceContext;
}

function sourceEvidence(request: FounderOsLabRequest) {
  const context = providerContext(request);
  return {
    repository: normalizedString(context.repository)
      ?? normalizedString(request.socialPost?.sourceRepository),
    commitSha: normalizedString(context.commitSha)?.toLowerCase()
      ?? normalizedString(request.socialPost?.sourceCommitSha)?.toLowerCase(),
    proofUrls: context.proofUrls?.length
      ? [...context.proofUrls]
      : request.socialPost?.proofLinks.map((link) => link.url) ?? [],
  };
}

function proofBindsToSource(
  proofUrls: readonly string[],
  repository: string,
  commitSha: string,
): boolean {
  const repositoryPath = `/${repository.toLowerCase().replace(/^\/+|\/+$/g, '')}/`;
  const normalizedSha = commitSha.toLowerCase();

  return proofUrls.some((proofUrl) => {
    try {
      const parsed = new URL(proofUrl);
      const path = decodeURIComponent(parsed.pathname).toLowerCase();
      const searchable = `${parsed.hostname.toLowerCase()}${path}${parsed.search.toLowerCase()}`;
      return path.includes(repositoryPath) && searchable.includes(normalizedSha);
    } catch {
      return false;
    }
  });
}

function sourceBindingErrors(request: FounderOsLabRequest, providerId: string): string[] {
  const { repository, commitSha, proofUrls } = sourceEvidence(request);
  if (!repository || !commitSha || proofUrls.length === 0) return [];

  return proofBindsToSource(proofUrls, repository, commitSha)
    ? []
    : [`${providerId} proof URLs do not bind to repository ${repository} at commit ${commitSha}.`];
}

/**
 * Validates provider-specific meaning after generic shape validation.
 * Presence alone is not enough for executor readiness.
 */
export function founderOsLabProviderEvidenceErrors(
  request: FounderOsLabRequest,
  providerId: FounderOsLabProviderId,
): string[] {
  const context = providerContext(request);
  const errors: string[] = [];

  if (providerId === 'github' || providerId === 'codex') {
    errors.push(...sourceBindingErrors(request, providerId));
  }

  if (providerId === 'supabase' || providerId === 'cloudflare') {
    if (!normalizedString(context.projectId)) {
      errors.push(`${providerId} preflight evidence requires projectId.`);
    }
    errors.push(...sourceBindingErrors(request, providerId));
  }

  if (providerId === 'zapier') {
    if (!normalizedString(context.automationId)) {
      errors.push('zapier preflight evidence requires automationId.');
    }
    errors.push(...sourceBindingErrors(request, providerId));
  }

  if (providerId === 'hubspot') {
    if (!normalizedString(context.workspaceId)) {
      errors.push('hubspot preflight evidence requires workspaceId.');
    }
    if (!Array.isArray(context.recordIds) || context.recordIds.length === 0) {
      errors.push('hubspot preflight evidence requires at least one recordId.');
    }
    if (!normalizedString(context.associationPlan)) {
      errors.push('hubspot preflight evidence requires associationPlan.');
    }
  }

  return errors;
}
