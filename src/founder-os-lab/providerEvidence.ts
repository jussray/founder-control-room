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

interface SourceEvidence {
  repository: string | null;
  commitSha: string | null;
  proofUrls: string[];
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

function normalizedRepository(value: unknown): string | null {
  const normalized = normalizedString(value)?.replace(/^\/+|\/+$/g, '').toLowerCase();
  return normalized && normalized.split('/').length === 2 ? normalized : null;
}

function normalizedSha(value: unknown): string | null {
  return normalizedString(value)?.toLowerCase() ?? null;
}

function providerContext(request: FounderOsLabRequest): ProviderEvidenceContext {
  return (request.evidence ?? {}) as ProviderEvidenceContext;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sourceEvidence(request: FounderOsLabRequest): SourceEvidence {
  const context = providerContext(request);
  const evidenceProofUrls = context.proofUrls ?? [];
  const socialProofUrls = request.socialPost?.proofLinks.map((link) => link.url) ?? [];

  return {
    repository: normalizedRepository(context.repository)
      ?? normalizedRepository(request.socialPost?.sourceRepository),
    commitSha: normalizedSha(context.commitSha)
      ?? normalizedSha(request.socialPost?.sourceCommitSha),
    proofUrls: uniqueStrings([...evidenceProofUrls, ...socialProofUrls]),
  };
}

function sourceIdentityErrors(request: FounderOsLabRequest): string[] {
  const context = providerContext(request);
  const evidenceRepository = normalizedRepository(context.repository);
  const socialRepository = normalizedRepository(request.socialPost?.sourceRepository);
  const evidenceSha = normalizedSha(context.commitSha);
  const socialSha = normalizedSha(request.socialPost?.sourceCommitSha);
  const errors: string[] = [];

  if (evidenceRepository && socialRepository && evidenceRepository !== socialRepository) {
    errors.push(
      `Evidence repository ${evidenceRepository} conflicts with social source repository ${socialRepository}.`,
    );
  }
  if (evidenceSha && socialSha && evidenceSha !== socialSha) {
    errors.push(`Evidence commit ${evidenceSha} conflicts with social source commit ${socialSha}.`);
  }

  return errors;
}

function parseTrustedHttpsUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function decodedSegments(parsed: URL): string[] {
  return parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment).toLowerCase());
}

function githubCommitProofBinds(
  proofUrl: string,
  repository: string,
  commitSha: string,
): boolean {
  const parsed = parseTrustedHttpsUrl(proofUrl);
  if (!parsed) return false;

  const [owner, repo] = repository.split('/');
  const segments = decodedSegments(parsed);
  const normalizedSha = commitSha.toLowerCase();

  if (parsed.hostname.toLowerCase() === 'github.com') {
    return segments[0] === owner
      && segments[1] === repo
      && segments[2] === 'commit'
      && segments[3] === normalizedSha;
  }

  if (parsed.hostname.toLowerCase() === 'api.github.com') {
    return segments[0] === 'repos'
      && segments[1] === owner
      && segments[2] === repo
      && segments[3] === 'commits'
      && segments[4] === normalizedSha;
  }

  return false;
}

function sourceBindingErrors(request: FounderOsLabRequest, providerId: string): string[] {
  const { repository, commitSha, proofUrls } = sourceEvidence(request);
  if (!repository || !commitSha || proofUrls.length === 0) return [];

  return proofUrls.some((proofUrl) => githubCommitProofBinds(proofUrl, repository, commitSha))
    ? []
    : [
      `${providerId} proof requires an authoritative GitHub commit URL for repository ${repository} at commit ${commitSha}.`,
    ];
}

function hostnameMatches(parsed: URL, hosts: readonly string[]): boolean {
  const hostname = parsed.hostname.toLowerCase();
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function normalizedIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function recordIdentifierToken(value: string): string {
  const normalized = normalizedIdentifier(value);
  return normalized.includes(':') ? normalized.slice(normalized.lastIndexOf(':') + 1) : normalized;
}

function urlContainsExactIdentifier(parsed: URL, identifier: string): boolean {
  const normalized = normalizedIdentifier(identifier);
  const pathSegments = decodedSegments(parsed);
  const hostSegments = parsed.hostname.toLowerCase().split('.');
  const queryValues = [...parsed.searchParams.values()].map((value) => value.toLowerCase());

  return pathSegments.includes(normalized)
    || hostSegments.includes(normalized)
    || queryValues.includes(normalized);
}

function hasTrustedProviderIdentityProof(
  proofUrls: readonly string[],
  trustedHosts: readonly string[],
  identifier: string,
): boolean {
  return proofUrls.some((proofUrl) => {
    const parsed = parseTrustedHttpsUrl(proofUrl);
    return Boolean(
      parsed
      && hostnameMatches(parsed, trustedHosts)
      && urlContainsExactIdentifier(parsed, identifier),
    );
  });
}

function associationPlanMentionsRecords(plan: string, recordIds: readonly string[]): boolean {
  const normalizedPlan = plan.toLowerCase();
  return recordIds.every((recordId) => {
    const normalized = normalizedIdentifier(recordId);
    const token = recordIdentifierToken(recordId);
    return normalizedPlan.includes(normalized) || normalizedPlan.includes(token);
  });
}

function providerIdentityErrors(
  request: FounderOsLabRequest,
  providerId: FounderOsLabProviderId,
): string[] {
  const context = providerContext(request);
  const proofUrls = sourceEvidence(request).proofUrls;
  const errors: string[] = [];

  if (providerId === 'supabase') {
    const projectId = normalizedString(context.projectId);
    if (!projectId) {
      errors.push('supabase preflight evidence requires projectId.');
    } else if (!hasTrustedProviderIdentityProof(
      proofUrls,
      ['supabase.com', 'supabase.co'],
      projectId,
    )) {
      errors.push(`supabase proof does not identify project ${projectId} on an authoritative Supabase URL.`);
    }
  }

  if (providerId === 'cloudflare') {
    const projectId = normalizedString(context.projectId);
    if (!projectId) {
      errors.push('cloudflare preflight evidence requires projectId.');
    } else if (!hasTrustedProviderIdentityProof(
      proofUrls,
      ['dash.cloudflare.com', 'api.cloudflare.com'],
      projectId,
    )) {
      errors.push(`cloudflare proof does not identify project ${projectId} on an authoritative Cloudflare URL.`);
    }
  }

  if (providerId === 'zapier') {
    const automationId = normalizedString(context.automationId);
    if (!automationId) {
      errors.push('zapier preflight evidence requires automationId.');
    } else if (!hasTrustedProviderIdentityProof(
      proofUrls,
      ['zapier.com'],
      automationId,
    )) {
      errors.push(`zapier proof does not identify automation ${automationId} on an authoritative Zapier URL.`);
    }
  }

  if (providerId === 'hubspot') {
    const workspaceId = normalizedString(context.workspaceId);
    const recordIds = Array.isArray(context.recordIds)
      ? context.recordIds.map((recordId) => normalizedString(recordId)).filter((recordId): recordId is string => Boolean(recordId))
      : [];
    const associationPlan = normalizedString(context.associationPlan);
    const trustedHosts = ['app.hubspot.com', 'api.hubapi.com'];

    if (!workspaceId) {
      errors.push('hubspot preflight evidence requires workspaceId.');
    } else if (!hasTrustedProviderIdentityProof(proofUrls, trustedHosts, workspaceId)) {
      errors.push(`hubspot proof does not identify workspace ${workspaceId} on an authoritative HubSpot URL.`);
    }

    if (recordIds.length === 0) {
      errors.push('hubspot preflight evidence requires at least one recordId.');
    } else {
      for (const recordId of recordIds) {
        const token = recordIdentifierToken(recordId);
        if (!hasTrustedProviderIdentityProof(proofUrls, trustedHosts, token)) {
          errors.push(`hubspot proof does not identify record ${recordId} on an authoritative HubSpot URL.`);
        }
      }
    }

    if (!associationPlan) {
      errors.push('hubspot preflight evidence requires associationPlan.');
    } else if (recordIds.length > 0 && !associationPlanMentionsRecords(associationPlan, recordIds)) {
      errors.push('hubspot associationPlan must name every submitted recordId.');
    }
  }

  return errors;
}

/**
 * Validates provider-specific meaning after generic shape validation.
 * Presence alone is not enough for executor readiness.
 */
export function founderOsLabProviderEvidenceErrors(
  request: FounderOsLabRequest,
  providerId: FounderOsLabProviderId,
): string[] {
  const errors = sourceIdentityErrors(request);

  if (
    providerId === 'github'
    || providerId === 'codex'
    || providerId === 'supabase'
    || providerId === 'cloudflare'
    || providerId === 'zapier'
  ) {
    errors.push(...sourceBindingErrors(request, providerId));
  }

  errors.push(...providerIdentityErrors(request, providerId));
  return errors;
}
