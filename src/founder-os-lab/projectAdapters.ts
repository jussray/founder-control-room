import { getPortfolioProject } from '../config/portfolio.js';
import type {
  FounderOsLabAction,
  FounderOsLabAdapterId,
  FounderOsLabCapabilityId,
  FounderOsLabCommandId,
  FounderOsLabProjectAdapterId,
  FounderOsLabProjectAudience,
  FounderOsLabProjectRoute,
  FounderOsLabProviderId,
  FounderOsLabRequest,
} from './contracts.js';

interface FounderOsLabProjectAdapterDescriptor {
  id: FounderOsLabProjectAdapterId;
  name: string;
  repository: string;
  auditedSourceHead: string;
  auditedContractBlobs: Readonly<Record<string, string>>;
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

interface NormalizedContractUrls {
  values: string[];
  validShape: boolean;
}

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SEKRET_BIP_REPOSITORY = 'jussray/Sekret-Bip';
const SEKRET_BIP_AUDITED_HEAD = 'cba061ae58ad3cfeb7f7f7fea2c666a7c85ae13e';
const SEKRET_BIP_AUDITED_CONTRACT_BLOBS = {
  'app/index.tsx': '46e73c816a392f289c377d5610243d8ef8189f7c',
  'screens/WebWelcomeScreen.tsx': '2520c10810593ebcab93e2d3be2a14cff6bd32ce',
  'constants/frontDoorTheme.ts': '0c331d30058ad21ea3cbb51e0788165008992d2f',
  'docs/COMPANION_NAME_CANON.md': 'fec910ecd3c99b08f1305225cfe3d1b1e82aa171',
  'docs/FRONT_DOOR_VARIANTS.md': '171db3a64822a46d052b290b55ebc890dc7a8d76',
  'implementation-ledger.extensions/human-ai-identity-contract.json': '2266fb7f8bf51506011d976f5907e9656da5a67b',
  'test/dual-front-door-contract.test.mjs': '6f4a3743a6accf9064877d3759ecb006f35a1b98',
} as const;
const PROJECT_AUDIENCES: ReadonlySet<FounderOsLabProjectAudience> = new Set(['teen', 'bip-jr']);

export const FOUNDER_OS_LAB_PROJECT_ADAPTERS: readonly FounderOsLabProjectAdapterDescriptor[] = [
  {
    id: 'sekret-bip',
    name: 'Se’kret Bip',
    repository: SEKRET_BIP_REPOSITORY,
    auditedSourceHead: SEKRET_BIP_AUDITED_HEAD,
    auditedContractBlobs: SEKRET_BIP_AUDITED_CONTRACT_BLOBS,
    authorityOwner: 'founder-control-room',
    mode: 'preview',
    executionAllowed: false,
    allowedActions: ['inspect', 'plan'],
    allowedProviders: ['chatgpt', 'claude', 'codex', 'github', 'figma'],
    requiredContractPaths: Object.keys(SEKRET_BIP_AUDITED_CONTRACT_BLOBS),
    canonicalDisplayNames: ['Night', 'Suhana', 'Sy', 'Cloud'],
    forbiddenDisplayNames: ['Suhanna'],
    legacyInternalIdsPreserved: true,
    editableOutputRequired: true,
    sourceTraceRequired: true,
    factualAiIdentityRequired: true,
    rollback: 'Discard the project preview; no Se’kret Bip repository, design, provider, account, or runtime state changes.',
  },
] as const;

function descriptorFor(id: unknown): FounderOsLabProjectAdapterDescriptor | null {
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

function normalizedAudience(value: unknown): FounderOsLabProjectAudience | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' && PROJECT_AUDIENCES.has(value as FounderOsLabProjectAudience)
    ? value as FounderOsLabProjectAudience
    : null;
}

function normalizedContractUrls(value: unknown): NormalizedContractUrls {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    return { values: [], validShape: false };
  }

  const values: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return { values: [], validShape: false };
    const normalized = item.trim();
    if (!normalized || normalized.length > 2_000) return { values: [], validShape: false };
    if (!values.includes(normalized)) values.push(normalized);
  }
  return { values, validShape: values.length === value.length };
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
  contractUrlsValidShape: boolean,
  audience: FounderOsLabProjectAudience | null,
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
  if (!contractUrlsValidShape) {
    errors.push(`${descriptor.id} contractUrls must contain 1 to 20 unique bounded HTTPS URL strings.`);
  }
  if (project.audience !== undefined && audience === null) {
    errors.push(`${descriptor.id} audience must be teen or bip-jr when supplied.`);
  }
  if (!descriptor.allowedActions.includes(request.action)) {
    errors.push(`${descriptor.id} adapter supports only inspect and plan previews in V1.`);
  }
  if (!descriptor.allowedProviders.includes(providerId)) {
    errors.push(`${providerId} is not an allowed ${descriptor.id} preview provider.`);
  }
  if (providerId === 'figma') {
    if (!audience) {
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

  const sourceRepository = normalizedRepository(project.sourceRepository) ?? '';
  const sourceCommitSha = normalizedSha(project.sourceCommitSha) ?? '';
  const contractUrls = normalizedContractUrls(project.contractUrls);
  const audience = normalizedAudience(project.audience);
  const observedPaths = observedContractPaths(
    contractUrls.values,
    descriptor.repository,
    descriptor.auditedSourceHead,
  );
  const missingPaths = descriptor.requiredContractPaths.filter((path) => !observedPaths.includes(path));
  const errors = projectAdapterErrors(
    request,
    descriptor,
    providerId,
    commandId,
    observedPaths,
    contractUrls.validShape,
    audience,
  );
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
      audience,
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
