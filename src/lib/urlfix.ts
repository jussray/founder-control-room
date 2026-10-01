import { createHash } from 'node:crypto';

import { getPortfolioProject } from '../config/portfolio.js';

export const URLFIX_FAILURE_PLANES = [
  'BROWSER',
  'APPLICATION',
  'API',
  'DATABASE',
  'AUTH',
  'CONFIG_SECRET',
  'DEPLOYMENT',
  'DNS',
  'CDN_EDGE',
  'THIRD_PARTY_PROVIDER',
  'UNKNOWN',
] as const;

export type UrlFixFailurePlane = (typeof URLFIX_FAILURE_PLANES)[number];

export const URLFIX_STATES = [
  'OBSERVED',
  'REPRODUCED',
  'CAUSE_BOUNDED',
  'PATCHED',
  'SOURCE_PROVEN',
  'LOCAL_BROWSER_PROVEN',
  'PREVIEW_BROWSER_PROVEN',
  'LIVE_BROWSER_PROVEN',
  'NOT_REPRODUCED',
  'DUPLICATE',
  'P3_LOGGED',
  'OBSERVATION_ONLY',
  'BLOCKED_AUTHORITY',
  'BLOCKED_PROVIDER',
  'BLOCKED_MAPPING',
  'BLOCKED_CARRIER_SCOPE',
  'BLOCKED_CONSEQUENTIAL_ACTION',
  'PATCHED_NOT_LIVE',
  'ROLLBACK_REQUIRED',
] as const;

export type UrlFixState = (typeof URLFIX_STATES)[number];
export type UrlFixEvidenceMode = 'REAL' | 'INTERCEPTED' | 'MOCKED' | 'FIXTURE';
export type UrlFixTarget = 'LOCAL' | 'PREVIEW' | 'LIVE';
export type UrlFixOwnershipState =
  | 'OWNED_CONFIRMED'
  | 'OWNED_AMBIGUOUS'
  | 'EXTERNAL'
  | 'UNKNOWN'
  | 'BLOCKED';

export interface UrlFixViewport {
  width: number;
  height: number;
}

export interface UrlFixWitnessSpec {
  route: string;
  viewport: UrlFixViewport;
  preconditions: readonly string[];
  actions: readonly string[];
  expectedObservableResult: string;
  dependencyMode: UrlFixEvidenceMode;
}

export interface UrlFixWitnessRun {
  runId: string;
  witnessFingerprint: string;
  target: UrlFixTarget;
  runtimeIdentity: string | null;
  evidenceMode: UrlFixEvidenceMode;
  observedResult: string;
  traceArtifactId: string | null;
  screenshotArtifactId?: string | null;
}

export interface UrlFixVerificationReceipt {
  issueId: string;
  witnessSpec: UrlFixWitnessSpec;
  before: UrlFixWitnessRun;
  after: UrlFixWitnessRun;
}

export interface UrlFixUrlBinding {
  url: string;
  projectSlug: string;
  repository: string;
  ownership: UrlFixOwnershipState;
  ownershipEvidenceRefs: readonly string[];
  repairScopeAuthorized: boolean;
  runtimeIdentity: string | null;
  deploymentProvider?: string | null;
  deploymentProject?: string | null;
}

export interface UrlFixBindingDecision {
  projectSlug: string | null;
  canonicalRepository: string | null;
  sourceMutationAllowed: boolean;
  runtimeIdentityKnown: boolean;
  errors: string[];
}

export interface UrlFixReceiptDecision {
  validSameWitness: boolean;
  proofState: UrlFixState;
  errors: string[];
}

function normalizeStringList(values: readonly string[]): string[] {
  return values.map((value) => value.trim());
}

export function createUrlFixWitnessFingerprint(spec: UrlFixWitnessSpec): string {
  const canonical = JSON.stringify({
    route: spec.route,
    viewport: { width: spec.viewport.width, height: spec.viewport.height },
    preconditions: normalizeStringList(spec.preconditions),
    actions: normalizeStringList(spec.actions),
    expectedObservableResult: spec.expectedObservableResult.trim(),
    dependencyMode: spec.dependencyMode,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function isUrlFixFailurePlane(value: string): value is UrlFixFailurePlane {
  return (URLFIX_FAILURE_PLANES as readonly string[]).includes(value);
}

export function evaluateUrlFixUrlBinding(binding: UrlFixUrlBinding): UrlFixBindingDecision {
  const errors: string[] = [];
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(binding.url);
  } catch {
    errors.push('binding URL is invalid');
  }

  if (parsedUrl && parsedUrl.protocol !== 'https:') errors.push('owned URL binding must use https');
  if (parsedUrl && (parsedUrl.username || parsedUrl.password)) errors.push('owned URL binding must not contain credentials');

  const project = getPortfolioProject(binding.projectSlug);
  if (!project) errors.push('project is not authority-bearing in the active FCR portfolio registry');
  if (project && project.repository !== binding.repository) errors.push('binding repository does not match the canonical FCR project repository');
  if (binding.ownership !== 'OWNED_CONFIRMED') errors.push('ownership is not confirmed');
  if (binding.ownershipEvidenceRefs.length === 0) errors.push('ownership confirmation has no evidence reference');

  const sourceMutationAllowed = Boolean(
    project
      && project.repository === binding.repository
      && binding.ownership === 'OWNED_CONFIRMED'
      && binding.ownershipEvidenceRefs.length > 0
      && binding.repairScopeAuthorized
      && errors.length === 0,
  );

  return {
    projectSlug: project?.slug ?? null,
    canonicalRepository: project?.repository ?? null,
    sourceMutationAllowed,
    runtimeIdentityKnown: Boolean(binding.runtimeIdentity?.trim()),
    errors,
  };
}

export function evaluateUrlFixVerificationReceipt(receipt: UrlFixVerificationReceipt): UrlFixReceiptDecision {
  const errors: string[] = [];
  const expectedFingerprint = createUrlFixWitnessFingerprint(receipt.witnessSpec);

  if (receipt.before.runId === receipt.after.runId) errors.push('before and after executions must have distinct run IDs');
  if (receipt.before.witnessFingerprint !== expectedFingerprint) errors.push('before run does not match the witness specification fingerprint');
  if (receipt.after.witnessFingerprint !== expectedFingerprint) errors.push('after run does not match the witness specification fingerprint');
  if (!receipt.before.traceArtifactId) errors.push('before trace artifact is required');
  if (!receipt.after.traceArtifactId) errors.push('after trace artifact is required');
  if (receipt.before.observedResult === receipt.witnessSpec.expectedObservableResult) errors.push('before run does not demonstrate the defect');
  if (receipt.after.observedResult !== receipt.witnessSpec.expectedObservableResult) errors.push('after run does not produce the expected observable result');

  const sameWitnessErrors = errors.filter((error) =>
    error.includes('witness specification') || error.includes('run IDs') || error.includes('trace artifact'),
  );
  const validSameWitness = sameWitnessErrors.length === 0;

  if (errors.length > 0) {
    return {
      validSameWitness,
      proofState: receipt.after.observedResult === receipt.witnessSpec.expectedObservableResult ? 'PATCHED_NOT_LIVE' : 'PATCHED',
      errors,
    };
  }

  if (receipt.after.evidenceMode !== 'REAL') {
    return {
      validSameWitness: true,
      proofState: 'PATCHED_NOT_LIVE',
      errors: ['mocked, intercepted, or fixture evidence cannot establish browser proof'],
    };
  }

  if (receipt.after.target === 'LIVE') {
    if (!receipt.after.runtimeIdentity?.trim()) {
      return {
        validSameWitness: true,
        proofState: 'PATCHED_NOT_LIVE',
        errors: ['live browser proof requires a known repaired runtime identity'],
      };
    }
    if (receipt.before.evidenceMode !== 'REAL') {
      return {
        validSameWitness: true,
        proofState: 'PATCHED_NOT_LIVE',
        errors: ['live before/after proof requires a real baseline witness'],
      };
    }
    return { validSameWitness: true, proofState: 'LIVE_BROWSER_PROVEN', errors: [] };
  }

  if (receipt.after.target === 'PREVIEW') {
    return { validSameWitness: true, proofState: 'PREVIEW_BROWSER_PROVEN', errors: [] };
  }

  return { validSameWitness: true, proofState: 'LOCAL_BROWSER_PROVEN', errors: [] };
}
