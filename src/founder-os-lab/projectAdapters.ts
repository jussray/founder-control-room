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
  adapterId: FounderOsLabAdapterId;
  name: string;
  repository: string;
  auditedSourceHead: string;
  auditedContractBlobs: Readonly<Record<string, string>>;
  authorityOwner: 'founder-control-room';
  mode: 'preview';
  executionAllowed: false;
  allowedActions: readonly FounderOsLabAction[];
  allowedProviders: readonly FounderOsLabProviderId[];
  allowedAudiences: readonly FounderOsLabProjectAudience[];
  capabilities: readonly FounderOsLabCapabilityId[];
  requiredContractPaths: readonly string[];
  rules: readonly string[];
  canonicalDisplayNames: readonly string[];
  forbiddenDisplayNames: readonly string[];
  legacyInternalIdsPreserved: boolean;
  editableOutputRequired: boolean;
  sourceTraceRequired: boolean;
  factualAiIdentityRequired: boolean;
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
const SEKRET_BIP_AUDITED_HEAD = '467da149bad1720f87885a991a924aa143eb2ddd';
const SEKRET_BIP_AUDITED_CONTRACT_BLOBS = {
  'app/index.tsx': '9fd126bbec9a9958ef9c39cf9a25356bee83bb87',
  'screens/WebWelcomeScreen.tsx': '5f1dafb209a9e8aee050b61fe38ace808e99f4b1',
  'constants/frontDoorTheme.ts': '0c331d30058ad21ea3cbb51e0788165008992d2f',
  'docs/COMPANION_NAME_CANON.md': 'fec910ecd3c99b08f1305225cfe3d1b1e82aa171',
  'docs/FRONT_DOOR_VARIANTS.md': '171db3a64822a46d052b290b55ebc890dc7a8d76',
  'implementation-ledger.extensions/human-ai-identity-contract.json': '2266fb7f8bf51506011d976f5907e9656da5a67b',
  'test/dual-front-door-contract.test.mjs': '1ceb267d7d20136d38fce95f2418fe22b6a1468e',
} as const;
const CHIEF_AI_REPOSITORY = 'jussray/chief-ai-machine';
const CHIEF_AI_AUDITED_HEAD = '2fd4fda0cab12e52ab5096e723884d98bcfe7d10';
const CHIEF_AI_AUDITED_CONTRACT_BLOBS = {
  'src/domain/capability-plan.js': '7b0c2e8d2bbbfce6a0b053134cc79ee3e0a17ec5',
  'src/domain/capability-registry.js': 'abb2daf0ee7ce85442cd4b04588b4881cc4b9b53',
  'src/domain/merge-intent.js': 'f4dd76e7b6d2cb05aa8f1923e529cae7142af1e0',
  'config/founder-chief-pair.contract.json': '7aaff727e0b460e42cf7a2a27d57381ce9f0a59a',
  'e2e/chief-capability-plan.pw.mjs': 'a2d42aeb4cdf6d7a69235bfa6a61b2194a8f20c4',
} as const;

export const FOUNDER_OS_LAB_PROJECT_ADAPTERS: readonly FounderOsLabProjectAdapterDescriptor[] = [
  {
    id: 'sekret-bip',
    adapterId: 'sekret-bip-project-preview',
    name: 'Se’kret Bip',
    repository: SEKRET_BIP_REPOSITORY,
    auditedSourceHead: SEKRET_BIP_AUDITED_HEAD,
    auditedContractBlobs: SEKRET_BIP_AUDITED_CONTRACT_BLOBS,
    authorityOwner: 'founder-control-room',
    mode: 'preview',
    executionAllowed: false,
    allowedActions: ['inspect', 'plan'],
    allowedProviders: ['chatgpt', 'claude', 'codex', 'github', 'figma'],
    allowedAudiences: ['teen', 'bip-jr'],
    capabilities: ['project-canon-validation', 'editable-design-preview'],
    requiredContractPaths: Object.keys(SEKRET_BIP_AUDITED_CONTRACT_BLOBS),
    rules: [
      'Display canon remains Night, Suhana, Sy, and Cloud; Suhanna is forbidden.',
      'Teen and Bip Jr are presentation audiences, not account roles.',
      'Legacy internal companion identifiers remain preserved unless separately migrated.',
      'Editable output, source trace, and factual AI identity boundaries remain required.',
    ],
    canonicalDisplayNames: ['Night', 'Suhana', 'Sy', 'Cloud'],
    forbiddenDisplayNames: ['Suhanna'],
    legacyInternalIdsPreserved: true,
    editableOutputRequired: true,
    sourceTraceRequired: true,
    factualAiIdentityRequired: true,
    rollback: 'Discard the project preview; no Se’kret Bip repository, design, provider, account, or runtime state changes.',
  },
  {
    id: 'chief-ai-machine',
    adapterId: 'chief-ai-machine-project-preview',
    name: 'Chief AI Prompt Machine',
    repository: CHIEF_AI_REPOSITORY,
    auditedSourceHead: CHIEF_AI_AUDITED_HEAD,
    auditedContractBlobs: CHIEF_AI_AUDITED_CONTRACT_BLOBS,
    authorityOwner: 'founder-control-room',
    mode: 'preview',
    executionAllowed: false,
    allowedActions: ['inspect', 'plan'],
    allowedProviders: ['chatgpt', 'claude', 'codex', 'github'],
    allowedAudiences: [],
    capabilities: [
      'project-contract-validation',
      'capability-plan-validation',
      'authority-boundary-validation',
    ],
    requiredContractPaths: Object.keys(CHIEF_AI_AUDITED_CONTRACT_BLOBS),
    rules: [
      'Chief AI owns reasoning, synthesis, capability composition, recommendations, and executive judgment; Founder Control Room owns governance, evidence, coordination, and execution authority.',
      'Capability plans must remain exact-head, registry-hash, provenance, and authority-ceiling bound.',
      'Merge intent may block a candidate but never authorize merge by itself.',
      'Chief AI proposals remain non-executing until Founder Control Room validates evidence and founder authority.',
    ],
    canonicalDisplayNames: [],
    forbiddenDisplayNames: [],
    legacyInternalIdsPreserved: false,
    editableOutputRequired: false,
    sourceTraceRequired: true,
    factualAiIdentityRequired: false,
    rollback: 'Discard the Chief AI project preview; no Chief AI repository, provider, capability registry, merge intent, or runtime state changes.',
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

function normalizedAudience(
  value: unknown,
  allowedAudiences: readonly FounderOsLabProjectAudience[],
): FounderOsLabProjectAudience | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string'
    && allowedAudiences.includes(value as FounderOsLabProjectAudience)
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
    errors.push(
      descriptor.allowedAudiences.length === 0
        ? `${descriptor.id} does not accept an audience context.`
        : `${descriptor.id} audience must be one of: ${descriptor.allowedAudiences.join(', ')}.`,
    );
  }
  if (!descriptor.allowedActions.includes(request.action)) {
    errors.push(`${descriptor.id} adapter supports only inspect and plan previews in V1.`);
  }
  if (!descriptor.allowedProviders.includes(providerId)) {
    errors.push(`${providerId} is not an allowed ${descriptor.id} preview provider.`);
  }
  if (descriptor.id === 'sekret-bip' && providerId === 'figma') {
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
      `${descriptor.id} is missing exact-head project contract URLs: ${missingPaths.join(', ')}.`,
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
  const audience = normalizedAudience(project.audience, descriptor.allowedAudiences);
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
      rules: [...descriptor.rules],
      canonicalDisplayNames: [...descriptor.canonicalDisplayNames],
      forbiddenDisplayNames: [...descriptor.forbiddenDisplayNames],
      legacyInternalIdsPreserved: descriptor.legacyInternalIdsPreserved,
      editableOutputRequired: descriptor.editableOutputRequired,
      sourceTraceRequired: descriptor.sourceTraceRequired,
      factualAiIdentityRequired: descriptor.factualAiIdentityRequired,
      rollback: descriptor.rollback,
    },
    errors,
    capabilities: [...descriptor.capabilities],
    adapters: [descriptor.adapterId],
  };
}
