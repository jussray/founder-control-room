import { getPortfolioProject } from '../config/portfolio.js';
import type {
  FounderOsLabAction,
  FounderOsLabAdapterId,
  FounderOsLabCapabilityId,
  FounderOsLabCommandId,
  FounderOsLabProjectAdapterId,
  FounderOsLabProjectRoute,
  FounderOsLabProviderId,
  FounderOsLabRequest,
} from './contracts.js';

interface FounderOsLabProjectAdapterDescriptor {
  id: FounderOsLabProjectAdapterId;
  name: string;
  repository: string;
  auditedSourceHead: string;
  authorityOwner: 'founder-control-room';
  mode: 'preview';
  executionAllowed: false;
  allowedActions: readonly FounderOsLabAction[];
  allowedProviders: readonly FounderOsLabProviderId[];
  requiredContractPaths: readonly string[];
  canonicalDisplayNames: readonly string[];
  forbiddenDisplayNames: readonly string[];
  legacyInternalIdsPreserved: true;
  editableOutputRequired: true;
  sourceTraceRequired: true;
  factualAiIdentityRequired: true;
  rollback: string;
}

export interface FounderOsLabProjectResolution {
  route: FounderOsLabProjectRoute | null;
  errors: string[];
  capabilities: FounderOsLabCapabilityId[];
  adapters: FounderOsLabAdapterId[];
}

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SEKRET_BIP_REPOSITORY = 'jussray/Sekret-Bip';
const SEKRET_BIP_AUDITED_HEAD = '1dba83386eb0a0865d051f2c74ae9046dafb5eeb';

export const FOUNDER_OS_LAB_PROJECT_ADAPTERS: readonly FounderOsLabProjectAdapterDescriptor[] = [
  {
    id: 'sekret-bip',
    name: 'Se’kret Bip',
    repository: SEKRET_BIP_REPOSITORY,
    auditedSourceHead: SEKRET_BIP_AUDITED_HEAD,
    authorityOwner: 'founder-control-room',
    mode: 'preview',
    executionAllowed: false,
    allowedActions: ['inspect', 'plan'],
    allowedProviders: ['chatgpt', 'claude', 'codex', 'github', 'figma'],
    requiredContractPaths: [
      'app/index.tsx',
      'constants/frontDoorTheme.ts',
      'docs/COMPANION_NAME_CANON.md',
      'docs/FRONT_DOOR_VARIANTS.md',
      'implementation-ledger.extensions/human-ai-identity-contract.json',
      'test/dual-front-door-contract.test.mjs',
    ],
    canonicalDisplayNames: ['Night', 'Suhana', 'Sy', 'Cloud'],
    forbiddenDisplayNames: ['Suhanna'],
    legacyInternalIdsPreserved: true,
    editableOutputRequired: true,
    sourceTraceRequired: true,
    factualAiIdentityRequired: true,
    rollback: 'Discard the project preview; no Se’kret Bip repository, design, provider, account, or runtime state changes.',
  },
] as const;

function descriptorFor(id: FounderOsLabProjectAdapterId): FounderOsLabProjectAdapterDescriptor | null {
  return FOUNDER_OS_LAB_PROJECT_ADAPTERS.find((adapter) => adapter.id === id) ?? null;
}

function normalizedRepository(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized || null;
}

function normalizedSha(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return EXACT_COMMIT_SHA.test(normalized) ? normalized : null;
}

function decodedSegments(parsed: URL): string[] | null {
  if (!parsed.pathname.startsWith('/') || parsed.pathname === '/' || parsed.pathname.endsWith('/')) {
    return null;
  }

  const rawSegments = parsed.pathname.slice(1).split('/');
  if (rawSegments.some((segment) => !segment)) return null;

  const segments: string[] = [];
  for (const segment of rawSegments) {
    try {
      const decoded = decodeURIComponent(segment);
      if (!decoded || decoded.includes('/') || decoded.includes('\\')) return null;
      segments.push(decoded);
    } catch {
      return null;
    }
  }
  return segments;
}

function contractPathFromUrl(
  value: string,
  repository: string,
  commitSha: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== 'github.com'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    return null;
  }

  const segments = decodedSegments(parsed);
  if (!segments) return null;
  const [owner, repo] = repository.split('/');
  if (
    segments.length < 6
    || segments[0]?.toLowerCase() !== owner?.toLowerCase()
    || segments[1]?.toLowerCase() !== repo?.toLowerCase()
    || segments[2] !== 'blob'
    || segments[3]?.toLowerCase() !== commitSha.toLowerCase()
  ) {
    return null;
  }

  return segments.slice(4).join('/');
}

function observedContractPaths(
  contractUrls: readonly string[],
  repository: string,
  commitSha: string,
): string[] {
  const observed: string[] = [];
  for (const value of contractUrls) {
    const path = contractPathFromUrl(value, repository, commitSha);
    if (path && !observed.includes(path)) observed.push(path);
  }
  return observed;
}

function projectAdapterErrors(
  request: FounderOsLabRequest,
  descriptor: FounderOsLabProjectAdapterDescriptor,
  providerId: FounderOsLabProviderId,
  commandId: FounderOsLabCommandId,
  observedPaths: readonly string[],
): string[] {
  const project = request.project;
  if (!project) return [];

  const errors: string[] = [];
  const portfolioProject = getPortfolioProject(descriptor.id);
  const sourceRepository = normalizedRepository(project.sourceRepository);
  const sourceCommitSha = normalizedSha(project.sourceCommitSha);

  if (
    !portfolioProject
    || portfolioProject.status !== 'active'
    || portfolioProject.repository !== descriptor.repository
  ) {
    errors.push(
      `${descriptor.id} is not bound to one active canonical repository in the Founder Control Room portfolio registry.`,
    );
  }
  if (!sourceRepository || sourceRepository.toLowerCase() !== descriptor.repository.toLowerCase()) {
    errors.push(`${descriptor.id} sourceRepository must be exactly ${descriptor.repository}.`);
  }
  if (!sourceCommitSha) {
    errors.push(`${descriptor.id} sourceCommitSha must be an exact 40-character hexadecimal SHA.`);
  } else if (sourceCommitSha !== descriptor.auditedSourceHead) {
    errors.push(
      `${descriptor.id} source head ${sourceCommitSha} has not been audited; expected ${descriptor.auditedSourceHead}.`,
    );
  }
  if (!descriptor.allowedActions.includes(request.action)) {
    errors.push(`${descriptor.id} adapter supports only inspect and plan previews in V1.`);
  }
  if (!descriptor.allowedProviders.includes(providerId)) {
    errors.push(`${providerId} is not an allowed ${descriptor.id} preview provider.`);
  }
  if (providerId === 'figma') {
    if (!project.audience) {
      errors.push('figma Se’kret Bip previews require an explicit teen or bip-jr presentation audience.');
    }
    if (commandId !== 'visualize' && commandId !== 'build') {
      errors.push('figma Se’kret Bip previews require the visualize or build command lens.');
    }
  }

  const missingPaths = descriptor.requiredContractPaths.filter((path) => !observedPaths.includes(path));
  if (missingPaths.length > 0) {
    errors.push(
      `${descriptor.id} is missing exact-head canon contract URLs: ${missingPaths.join(', ')}.`,
    );
  }

  return errors;
}

export function resolveFounderOsLabProject(
  request: FounderOsLabRequest,
  providerId: FounderOsLabProviderId,
  commandId: FounderOsLabCommandId,
): FounderOsLabProjectResolution {
  const project = request.project;
  if (!project) {
    return { route: null, errors: [], capabilities: [], adapters: [] };
  }

  const descriptor = descriptorFor(project.id);
  if (!descriptor) {
    return {
      route: null,
      errors: [`Unknown Founder OS project adapter: ${String(project.id)}.`],
      capabilities: [],
      adapters: [],
    };
  }

  const sourceRepository = normalizedRepository(project.sourceRepository) ?? project.sourceRepository;
  const sourceCommitSha = normalizedSha(project.sourceCommitSha) ?? project.sourceCommitSha.trim().toLowerCase();
  const observedPaths = observedContractPaths(
    project.contractUrls,
    descriptor.repository,
    descriptor.auditedSourceHead,
  );
  const missingPaths = descriptor.requiredContractPaths.filter((path) => !observedPaths.includes(path));
  const errors = projectAdapterErrors(request, descriptor, providerId, commandId, observedPaths);
  const supported = descriptor.allowedActions.includes(request.action)
    && descriptor.allowedProviders.includes(providerId);

  return {
    route: {
      id: descriptor.id,
      name: descriptor.name,
      mode: descriptor.mode,
      supported,
      executionAllowed: false,
      authorityOwner: descriptor.authorityOwner,
      repository: sourceRepository,
      sourceCommitSha,
      auditedSourceHead: descriptor.auditedSourceHead,
      audience: project.audience ?? null,
      allowedActions: [...descriptor.allowedActions],
      allowedProviders: [...descriptor.allowedProviders],
      contractPathsRequired: [...descriptor.requiredContractPaths],
      contractPathsObserved: observedPaths,
      contractPathsMissing: missingPaths,
      canonicalDisplayNames: [...descriptor.canonicalDisplayNames],
      forbiddenDisplayNames: [...descriptor.forbiddenDisplayNames],
      legacyInternalIdsPreserved: descriptor.legacyInternalIdsPreserved,
      editableOutputRequired: descriptor.editableOutputRequired,
      sourceTraceRequired: descriptor.sourceTraceRequired,
      factualAiIdentityRequired: descriptor.factualAiIdentityRequired,
      rollback: descriptor.rollback,
    },
    errors,
    capabilities: ['project-canon-validation', 'editable-design-preview'],
    adapters: ['sekret-bip-project-preview'],
  };
}
