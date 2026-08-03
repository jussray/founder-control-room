import type {
  FounderOsLabEvidenceField,
  FounderOsLabProviderId,
  FounderOsLabRequest,
} from './contracts.js';

interface SourceEvidence {
  repository: string | null;
  commitSha: string | null;
  proofUrls: string[];
}

interface HubSpotRecordIdentity {
  canonical: string;
  objectType: keyof typeof HUBSPOT_OBJECT_TYPES;
  recordId: string;
}

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY_NAME = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
const HUBSPOT_OBJECT_TYPES = {
  contact: { appCode: '0-1' },
  company: { appCode: '0-2' },
  deal: { appCode: '0-3' },
  ticket: { appCode: '0-5' },
} as const;
const TYPED_HUBSPOT_ID = /(?:^|[^a-z0-9_-])((?:contact|company|deal|ticket):[a-z0-9_-]+)(?=$|[^a-z0-9_-])/gi;

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
  supabase: ['repository', 'commitSha', 'proofUrls', 'projectId'],
  cloudflare: [
    'repository',
    'commitSha',
    'proofUrls',
    'projectId',
    'providerAccountId',
  ],
  zapier: ['repository', 'commitSha', 'proofUrls', 'automationId'],
  figma: [],
  'openai-platform': [],
  hubspot: ['proofUrls', 'workspaceId', 'recordIds', 'associationPlan'],
} as const;

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedRepository(value: unknown): string | null {
  const normalized = normalizedString(value)?.replace(/^\/+|\/+$/g, '').toLowerCase();
  return normalized && REPOSITORY_NAME.test(normalized) ? normalized : null;
}

function normalizedSha(value: unknown): string | null {
  const normalized = normalizedString(value)?.toLowerCase();
  return normalized && EXACT_COMMIT_SHA.test(normalized) ? normalized : null;
}

function providerContext(request: FounderOsLabRequest) {
  return request.evidence ?? {};
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
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

function normalizedProofUrls(values: readonly unknown[]): string[] {
  const normalized: string[] = [];
  for (const value of values) {
    const candidate = normalizedString(value);
    if (!candidate) continue;
    const parsed = parseTrustedHttpsUrl(candidate);
    if (parsed && !normalized.includes(parsed.href)) normalized.push(parsed.href);
  }
  return normalized;
}

function normalizedRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value
      .map((recordId) => normalizedString(recordId)?.toLowerCase() ?? null)
      .filter((recordId): recordId is string => Boolean(recordId)),
  );
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
    proofUrls: normalizedProofUrls([...evidenceProofUrls, ...socialProofUrls]),
  };
}

/**
 * Returns only normalized, format-valid evidence fields. Direct planner callers
 * therefore receive the same fail-closed behavior as the HTTP parser.
 */
export function founderOsLabObservedEvidenceFields(
  request: FounderOsLabRequest,
): FounderOsLabEvidenceField[] {
  const observed: FounderOsLabEvidenceField[] = [];
  const context = providerContext(request);
  const source = sourceEvidence(request);

  if (source.repository) observed.push('repository');
  if (source.commitSha) observed.push('commitSha');
  if (source.proofUrls.length > 0) observed.push('proofUrls');
  if (normalizedString(context.projectId)) observed.push('projectId');
  if (normalizedString(context.providerAccountId)) observed.push('providerAccountId');
  if (normalizedString(context.automationId)) observed.push('automationId');
  if (normalizedString(context.workspaceId)) observed.push('workspaceId');

  const recordIds = normalizedRecordIds(context.recordIds);
  if (
    recordIds.length > 0
    && Array.isArray(context.recordIds)
    && recordIds.length === context.recordIds.length
  ) {
    observed.push('recordIds');
  }
  if (normalizedString(context.associationPlan)) observed.push('associationPlan');

  return observed;
}

function sourceIdentityErrors(request: FounderOsLabRequest): string[] {
  const context = providerContext(request);
  const rawEvidenceRepository = normalizedString(context.repository);
  const rawSocialRepository = normalizedString(request.socialPost?.sourceRepository);
  const rawEvidenceSha = normalizedString(context.commitSha);
  const rawSocialSha = normalizedString(request.socialPost?.sourceCommitSha);
  const evidenceRepository = normalizedRepository(context.repository);
  const socialRepository = normalizedRepository(request.socialPost?.sourceRepository);
  const evidenceSha = normalizedSha(context.commitSha);
  const socialSha = normalizedSha(request.socialPost?.sourceCommitSha);
  const rawProofUrls = [
    ...(context.proofUrls ?? []),
    ...(request.socialPost?.proofLinks.map((link) => link.url) ?? []),
  ];
  const errors: string[] = [];

  if (rawEvidenceRepository && !evidenceRepository) {
    errors.push('Evidence repository must use the exact owner/repository format.');
  }
  if (rawSocialRepository && !socialRepository) {
    errors.push('Social source repository must use the exact owner/repository format.');
  }
  if (rawEvidenceSha && !evidenceSha) {
    errors.push('Evidence commit must be an exact 40-character hexadecimal SHA.');
  }
  if (rawSocialSha && !socialSha) {
    errors.push('Social source commit must be an exact 40-character hexadecimal SHA.');
  }
  if (rawProofUrls.some((proofUrl) => {
    const candidate = normalizedString(proofUrl);
    return !candidate || !parseTrustedHttpsUrl(candidate);
  })) {
    errors.push('Evidence proof URLs must be valid HTTPS URLs without embedded credentials.');
  }

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

/**
 * Decodes an exact slash-delimited path. Empty segments, trailing separators,
 * encoded separators, and malformed encoding all fail closed.
 */
function decodedSegments(parsed: URL): string[] | null {
  const pathname = parsed.pathname;
  if (!pathname.startsWith('/') || pathname === '/' || pathname.endsWith('/')) return null;

  const rawSegments = pathname.slice(1).split('/');
  if (rawSegments.length === 0 || rawSegments.some((segment) => !segment)) return null;

  const decoded: string[] = [];
  for (const segment of rawSegments) {
    try {
      const value = decodeURIComponent(segment).toLowerCase();
      if (!value || value.includes('/') || value.includes('\\')) return null;
      decoded.push(value);
    } catch {
      return null;
    }
  }
  return decoded;
}

function exactHostname(parsed: URL, hosts: readonly string[]): boolean {
  return hosts.includes(parsed.hostname.toLowerCase());
}

function githubCommitProofBinds(
  proofUrl: string,
  repository: string,
  commitSha: string,
): boolean {
  const parsed = parseTrustedHttpsUrl(proofUrl);
  if (!parsed || parsed.search || parsed.hash) return false;

  const [owner, repo] = repository.split('/');
  const segments = decodedSegments(parsed);
  const normalizedCommitSha = commitSha.toLowerCase();
  if (!segments) return false;

  if (parsed.hostname.toLowerCase() === 'github.com') {
    return segments.length === 4
      && segments[0] === owner
      && segments[1] === repo
      && segments[2] === 'commit'
      && segments[3] === normalizedCommitSha;
  }

  if (parsed.hostname.toLowerCase() === 'api.github.com') {
    return segments.length === 5
      && segments[0] === 'repos'
      && segments[1] === owner
      && segments[2] === repo
      && segments[3] === 'commits'
      && segments[4] === normalizedCommitSha;
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

function supabaseProjectProofBinds(proofUrl: string, projectId: string): boolean {
  const parsed = parseTrustedHttpsUrl(proofUrl);
  if (!parsed) return false;

  const normalizedProjectId = projectId.toLowerCase();
  if (parsed.hostname.toLowerCase() === `${normalizedProjectId}.supabase.co`) {
    return parsed.pathname === '/' && !parsed.search && !parsed.hash;
  }

  const segments = decodedSegments(parsed);
  if (!segments) return false;

  if (exactHostname(parsed, ['app.supabase.com'])) {
    return segments.length >= 2
      && segments[0] === 'project'
      && segments[1] === normalizedProjectId;
  }
  if (exactHostname(parsed, ['supabase.com', 'www.supabase.com'])) {
    return segments.length >= 3
      && segments[0] === 'dashboard'
      && segments[1] === 'project'
      && segments[2] === normalizedProjectId;
  }
  if (exactHostname(parsed, ['api.supabase.com'])) {
    return segments.length === 3
      && segments[0] === 'v1'
      && segments[1] === 'projects'
      && segments[2] === normalizedProjectId;
  }
  return false;
}

function cloudflareProjectProofBinds(
  proofUrl: string,
  providerAccountId: string,
  projectId: string,
): boolean {
  const parsed = parseTrustedHttpsUrl(proofUrl);
  const segments = parsed ? decodedSegments(parsed) : null;
  const normalizedAccountId = providerAccountId.toLowerCase();
  const normalizedProjectId = projectId.toLowerCase();
  if (!parsed || !segments) return false;

  if (exactHostname(parsed, ['dash.cloudflare.com'])) {
    return (
      segments.length === 4
      && segments[0] === normalizedAccountId
      && segments[1] === 'pages'
      && segments[2] === 'view'
      && segments[3] === normalizedProjectId
    ) || (
      segments.length === 4
      && segments[0] === normalizedAccountId
      && segments[1] === 'workers'
      && segments[2] === 'services'
      && segments[3] === normalizedProjectId
    ) || (
      segments.length === 5
      && segments[0] === normalizedAccountId
      && segments[1] === 'workers'
      && segments[2] === 'services'
      && segments[3] === 'view'
      && segments[4] === normalizedProjectId
    );
  }

  if (exactHostname(parsed, ['api.cloudflare.com'])) {
    return segments.length === 7
      && segments[0] === 'client'
      && segments[1] === 'v4'
      && segments[2] === 'accounts'
      && segments[3] === normalizedAccountId
      && (
        (segments[4] === 'pages' && segments[5] === 'projects' && segments[6] === normalizedProjectId)
        || (segments[4] === 'workers' && segments[5] === 'services' && segments[6] === normalizedProjectId)
      );
  }

  return false;
}

function zapierAutomationProofBinds(proofUrl: string, automationId: string): boolean {
  const parsed = parseTrustedHttpsUrl(proofUrl);
  const segments = parsed ? decodedSegments(parsed) : null;
  const normalizedAutomationId = automationId.toLowerCase();
  if (!parsed || !segments || !exactHostname(parsed, ['zapier.com', 'www.zapier.com'])) return false;

  return segments.length === 3
    && segments[0] === 'app'
    && (segments[1] === 'editor' || segments[1] === 'zaps')
    && segments[2] === normalizedAutomationId;
}

function parseHubSpotRecordIdentity(value: string): HubSpotRecordIdentity | null {
  const normalized = value.trim().toLowerCase();
  const separator = normalized.indexOf(':');
  if (separator <= 0 || separator === normalized.length - 1) return null;

  const objectType = normalized.slice(0, separator) as keyof typeof HUBSPOT_OBJECT_TYPES;
  const recordId = normalized.slice(separator + 1);
  if (!HUBSPOT_OBJECT_TYPES[objectType] || !/^[a-z0-9_-]+$/i.test(recordId)) return null;

  return { canonical: `${objectType}:${recordId}`, objectType, recordId };
}

function hubspotWorkspaceProofBinds(proofUrl: string, workspaceId: string): boolean {
  const parsed = parseTrustedHttpsUrl(proofUrl);
  const segments = parsed ? decodedSegments(parsed) : null;
  if (!parsed || !segments || !exactHostname(parsed, ['app.hubspot.com'])) return false;
  return segments.length >= 2
    && segments[0] === 'contacts'
    && segments[1] === workspaceId.toLowerCase();
}

/**
 * HubSpot API object URLs do not carry the selected portal/workspace identity.
 * Only the workspace-bound app route may prove a record for this preview gate.
 */
function hubspotRecordProofBinds(
  proofUrl: string,
  workspaceId: string,
  identity: HubSpotRecordIdentity,
): boolean {
  const parsed = parseTrustedHttpsUrl(proofUrl);
  const segments = parsed ? decodedSegments(parsed) : null;
  if (!parsed || !segments || !exactHostname(parsed, ['app.hubspot.com'])) return false;

  const route = HUBSPOT_OBJECT_TYPES[identity.objectType];
  return segments.length === 5
    && segments[0] === 'contacts'
    && segments[1] === workspaceId.toLowerCase()
    && segments[2] === 'record'
    && segments[3] === route.appCode
    && segments[4] === identity.recordId;
}

function associationPlanMentionsRecords(
  plan: string,
  recordIds: readonly HubSpotRecordIdentity[],
): boolean {
  const identities = new Set<string>();
  for (const match of plan.toLowerCase().matchAll(TYPED_HUBSPOT_ID)) {
    if (match[1]) identities.add(match[1]);
  }
  return recordIds.every((recordId) => identities.has(recordId.canonical));
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
    } else if (!proofUrls.some((proofUrl) => supabaseProjectProofBinds(proofUrl, projectId))) {
      errors.push(`supabase proof does not identify project ${projectId} on an authoritative Supabase project route.`);
    }
  }

  if (providerId === 'cloudflare') {
    const projectId = normalizedString(context.projectId);
    const providerAccountId = normalizedString(context.providerAccountId);
    if (!projectId) {
      errors.push('cloudflare preflight evidence requires projectId.');
    }
    if (!providerAccountId) {
      errors.push('cloudflare preflight evidence requires providerAccountId.');
    }
    if (
      projectId
      && providerAccountId
      && !proofUrls.some((proofUrl) => (
        cloudflareProjectProofBinds(proofUrl, providerAccountId, projectId)
      ))
    ) {
      errors.push(
        `cloudflare proof does not identify account ${providerAccountId} and project ${projectId} on one authoritative Cloudflare project route.`,
      );
    }
  }

  if (providerId === 'zapier') {
    const automationId = normalizedString(context.automationId);
    if (!automationId) {
      errors.push('zapier preflight evidence requires automationId.');
    } else if (!proofUrls.some((proofUrl) => zapierAutomationProofBinds(proofUrl, automationId))) {
      errors.push(`zapier proof does not identify automation ${automationId} on an authoritative Zapier automation route.`);
    }
  }

  if (providerId === 'hubspot') {
    const workspaceId = normalizedString(context.workspaceId);
    const rawRecordIds = Array.isArray(context.recordIds) ? context.recordIds : [];
    const recordIds = normalizedRecordIds(context.recordIds);
    const identities = recordIds.map(parseHubSpotRecordIdentity);
    const associationPlan = normalizedString(context.associationPlan);

    if (!workspaceId) {
      errors.push('hubspot preflight evidence requires workspaceId.');
    } else if (!proofUrls.some((proofUrl) => hubspotWorkspaceProofBinds(proofUrl, workspaceId))) {
      errors.push(`hubspot proof does not identify workspace ${workspaceId} on an authoritative HubSpot workspace route.`);
    }

    if (recordIds.length === 0 || recordIds.length !== rawRecordIds.length) {
      errors.push('hubspot preflight evidence requires at least one nonempty typed recordId.');
    } else {
      for (let index = 0; index < recordIds.length; index += 1) {
        const identity = identities[index];
        if (!identity) {
          errors.push(
            `hubspot recordId ${recordIds[index]} must use a supported typed identifier: contact, company, deal, or ticket.`,
          );
          continue;
        }
        if (!workspaceId || !proofUrls.some((proofUrl) => (
          hubspotRecordProofBinds(proofUrl, workspaceId, identity)
        ))) {
          errors.push(`hubspot proof does not identify record ${identity.canonical} on its workspace-bound object-type route.`);
        }
      }
    }

    if (!associationPlan) {
      errors.push('hubspot preflight evidence requires associationPlan.');
    } else {
      const validIdentities = identities.filter(
        (identity): identity is HubSpotRecordIdentity => Boolean(identity),
      );
      if (
        validIdentities.length !== recordIds.length
        || !associationPlanMentionsRecords(associationPlan, validIdentities)
      ) {
        errors.push('hubspot associationPlan must name every submitted typed recordId exactly.');
      }
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
