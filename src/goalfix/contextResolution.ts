export interface GoalfixProjectCandidate {
  id: string;
  slug: string;
  name: string;
  repo_provider: string;
  repo_identifier: string | null;
}

export type GoalfixProjectResolution =
  | { status: 'resolved'; project: GoalfixProjectCandidate }
  | { status: 'not_found'; candidates: [] }
  | { status: 'ambiguous'; candidates: GoalfixProjectCandidate[] };

export interface GoalfixVerificationContract {
  manifestRepository: string;
  requiredVerificationNames: string[];
}

export const GOALFIX_AUTO_STOP_CONDITION =
  'Stop before mutation when required exact-head proof is incomplete, project identity is ambiguous, or founder approval is required.';

const MANIFEST_MAX_BYTES = 256_000;
const VERIFICATION_NAME_MAX_LENGTH = 200;
const VERIFICATION_NAME_MAX_COUNT = 50;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const ALLOWED_WORKFLOW_STATUSES = new Set([
  'active',
  'main-only',
  'founder-gated',
  'missing',
  'retired',
]);

export class GoalfixContextResolutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoalfixContextResolutionError';
    this.code = code;
  }
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactKey(value: string): string {
  return normalizeKey(value).replace(/\s+/g, '');
}

function repositoryLeaf(repository: string | null): string {
  if (!repository) return '';
  return repository.trim().split('/').filter(Boolean).at(-1) ?? '';
}

function nameInitials(name: string): string {
  return normalizeKey(name)
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('');
}

function aliasScores(project: GoalfixProjectCandidate): Map<string, number> {
  const aliases = new Map<string, number>();
  const add = (value: string, score: number) => {
    const normalized = normalizeKey(value);
    const compact = compactKey(value);
    if (normalized) aliases.set(normalized, Math.max(score, aliases.get(normalized) ?? 0));
    if (compact) aliases.set(compact, Math.max(score, aliases.get(compact) ?? 0));
  };

  add(project.slug, 100);
  add(project.name, 95);
  if (project.repo_identifier) add(project.repo_identifier, 90);
  add(repositoryLeaf(project.repo_identifier), 90);
  add(nameInitials(project.name), 85);

  for (const token of normalizeKey(project.name).split(' ')) {
    if (token.length >= 2) add(token, 70);
  }
  for (const token of normalizeKey(repositoryLeaf(project.repo_identifier)).split(' ')) {
    if (token.length >= 2) add(token, 65);
  }

  return aliases;
}

export function resolveGoalfixProjectHint(
  projects: GoalfixProjectCandidate[],
  hint: string,
): GoalfixProjectResolution {
  const normalizedHint = normalizeKey(hint);
  const compactHint = compactKey(hint);
  if (!normalizedHint) return { status: 'not_found', candidates: [] };

  const matches = projects
    .map((project) => {
      const aliases = aliasScores(project);
      return {
        project,
        score: Math.max(aliases.get(normalizedHint) ?? 0, aliases.get(compactHint) ?? 0),
      };
    })
    .filter((entry) => entry.score > 0);

  if (matches.length === 0) return { status: 'not_found', candidates: [] };
  const bestScore = Math.max(...matches.map((entry) => entry.score));
  const best = matches.filter((entry) => entry.score === bestScore).map((entry) => entry.project);
  if (best.length !== 1) return { status: 'ambiguous', candidates: best };
  return { status: 'resolved', project: best[0]! };
}

function normalizedRepositoryIdentity(value: string): string {
  return value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').toLocaleLowerCase('en-US');
}

export function repositoryIdentityMatches(expected: string, observed: string): boolean {
  return normalizedRepositoryIdentity(expected) === normalizedRepositoryIdentity(observed);
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function parseBoundedJsonObject(text: string, description: string): Record<string, unknown> {
  if (Buffer.byteLength(text, 'utf8') > MANIFEST_MAX_BYTES) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_VERIFICATION_CONTRACT_INVALID',
      `${description} exceeds the bounded GoalFix size limit.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GoalfixContextResolutionError(
      'GOALFIX_VERIFICATION_CONTRACT_INVALID',
      `${description} is not valid JSON.`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_VERIFICATION_CONTRACT_INVALID',
      `${description} must be an object.`,
    );
  }

  return parsed as Record<string, unknown>;
}

function assertRepositoryIdentity(
  root: Record<string, unknown>,
  expectedRepository: string,
  description: string,
): string {
  const repository = typeof root.repository === 'string' ? root.repository.trim() : '';
  if (!repository || !repositoryIdentityMatches(expectedRepository, repository)) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_REPOSITORY_IDENTITY_MISMATCH',
      `${description} identity does not match the registered project repository.`,
    );
  }
  return repository;
}

function requiredWorkflowNames(
  workflowCatalog: unknown[],
  targetRef: string,
  defaultBranch: string,
): string[] {
  if (workflowCatalog.length === 0 || workflowCatalog.length > VERIFICATION_NAME_MAX_COUNT) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_VERIFICATION_CONTRACT_INVALID',
      'Repository workflow catalog must be bounded and non-empty.',
    );
  }

  const branchAmbiguousExactSha = COMMIT_SHA_PATTERN.test(targetRef);
  const requiredNames: string[] = [];
  for (const entry of workflowCatalog) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new GoalfixContextResolutionError(
        'GOALFIX_VERIFICATION_CONTRACT_INVALID',
        'Repository workflow catalog entries must be objects.',
      );
    }
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const status = typeof row.status === 'string' ? row.status.trim() : '';
    if (!status || !ALLOWED_WORKFLOW_STATUSES.has(status)) {
      throw new GoalfixContextResolutionError(
        'GOALFIX_VERIFICATION_CONTRACT_INVALID',
        'Repository workflow catalog status is unsupported.',
      );
    }
    if (row.required !== true || status === 'retired') continue;
    if (status === 'main-only' && targetRef !== defaultBranch && !branchAmbiguousExactSha) continue;
    if (!name || name.length > VERIFICATION_NAME_MAX_LENGTH) {
      throw new GoalfixContextResolutionError(
        'GOALFIX_VERIFICATION_CONTRACT_INVALID',
        'Repository workflow catalog has an invalid required name.',
      );
    }
    requiredNames.push(name);
  }

  return uniqueNames(requiredNames);
}

function requiredLedgerNames(policyText: string, expectedRepository: string): string[] {
  const ledger = parseBoundedJsonObject(policyText, 'Repository test-ledger policy');
  assertRepositoryIdentity(ledger, expectedRepository, 'Repository test-ledger policy');

  const policy = ledger.policy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
      'Repository test-ledger policy does not expose provider check authority.',
    );
  }

  const requiredChecks = (policy as Record<string, unknown>).requiredChecks;
  if (!Array.isArray(requiredChecks) || requiredChecks.length === 0 || requiredChecks.length > VERIFICATION_NAME_MAX_COUNT) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
      'Repository test-ledger policy does not expose an explicit bounded requiredChecks set.',
    );
  }

  const names: string[] = [];
  for (const value of requiredChecks) {
    if (typeof value !== 'string') {
      throw new GoalfixContextResolutionError(
        'GOALFIX_VERIFICATION_CONTRACT_INVALID',
        'Repository test-ledger requiredChecks entries must be strings.',
      );
    }
    const name = value.trim();
    if (!name || name.length > VERIFICATION_NAME_MAX_LENGTH) {
      throw new GoalfixContextResolutionError(
        'GOALFIX_VERIFICATION_CONTRACT_INVALID',
        'Repository test-ledger contains an invalid required check name.',
      );
    }
    names.push(name);
  }

  return uniqueNames(names);
}

export function parseGoalfixVerificationManifest(
  text: string,
  expectedRepository: string,
  targetRef: string,
  defaultBranch: string,
  providerPolicyText?: string,
): GoalfixVerificationContract {
  const root = parseBoundedJsonObject(text, 'Repository verification manifest');
  const manifestRepository = assertRepositoryIdentity(
    root,
    expectedRepository,
    'Repository verification manifest',
  );

  const tests = root.tests;
  if (!tests || typeof tests !== 'object' || Array.isArray(tests)) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_VERIFICATION_CONTRACT_INVALID',
      'Repository verification manifest has no tests contract.',
    );
  }

  const testContract = tests as Record<string, unknown>;
  const providerCheckPolicy = typeof testContract.providerCheckPolicy === 'string'
    ? testContract.providerCheckPolicy.trim()
    : '';
  if (providerCheckPolicy) {
    if (providerCheckPolicy.length > 300) {
      throw new GoalfixContextResolutionError(
        'GOALFIX_VERIFICATION_CONTRACT_INVALID',
        'Repository provider-check policy path is too long.',
      );
    }
    if (!providerPolicyText) {
      throw new GoalfixContextResolutionError(
        'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
        'Repository declares an explicit provider-check policy; the exact policy must be read before GoalFix can classify provider proof.',
      );
    }
    const requiredVerificationNames = requiredLedgerNames(providerPolicyText, expectedRepository);
    if (requiredVerificationNames.length === 0) {
      throw new GoalfixContextResolutionError(
        'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
        'Repository provider policy does not expose an applicable required proof set.',
      );
    }
    return { manifestRepository, requiredVerificationNames };
  }

  const workflowCatalog = testContract.workflowCatalog;
  if (Array.isArray(workflowCatalog)) {
    const requiredWorkflowVerificationNames = requiredWorkflowNames(
      workflowCatalog,
      targetRef,
      defaultBranch,
    );
    if (requiredWorkflowVerificationNames.length === 0) {
      throw new GoalfixContextResolutionError(
        'GOALFIX_VERIFICATION_CONTRACT_UNAVAILABLE',
        'Repository workflow catalog does not expose an applicable required proof set.',
      );
    }

    // A repository may explicitly declare that workflowCatalog is inventory,
    // not provider pass evidence. In that case GoalFix must consume exact
    // provider check-run names from the repository policy instead of guessing
    // that workflow display names equal check_run.name.
    if (testContract.catalogIsPassEvidence === false) {
      if (!providerPolicyText) {
        throw new GoalfixContextResolutionError(
          'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
          'Repository workflow catalog is inventory only; exact provider required-check policy is required before GoalFix can classify provider proof.',
        );
      }
      const requiredVerificationNames = requiredLedgerNames(providerPolicyText, expectedRepository);
      if (requiredVerificationNames.length === 0) {
        throw new GoalfixContextResolutionError(
          'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
          'Repository provider policy does not expose an applicable required proof set.',
        );
      }
      return { manifestRepository, requiredVerificationNames };
    }

    return { manifestRepository, requiredVerificationNames: requiredWorkflowVerificationNames };
  }

  const catalog = testContract.catalog;
  if (!Array.isArray(catalog) || catalog.length === 0 || catalog.length > VERIFICATION_NAME_MAX_COUNT) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_VERIFICATION_CONTRACT_INVALID',
      'Repository verification manifest must contain tests.workflowCatalog or a bounded tests.catalog.',
    );
  }

  if (!providerPolicyText) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
      'Repository tests.catalog is inventory only; exact provider required-check policy is required before GoalFix can classify provider proof.',
    );
  }

  const requiredVerificationNames = requiredLedgerNames(providerPolicyText, expectedRepository);
  if (requiredVerificationNames.length === 0) {
    throw new GoalfixContextResolutionError(
      'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
      'Repository provider policy does not expose an applicable required proof set.',
    );
  }

  return { manifestRepository, requiredVerificationNames };
}
