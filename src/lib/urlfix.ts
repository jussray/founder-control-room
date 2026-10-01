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

/**
 * Stable behavioral witness. Environment/dependency mode is intentionally NOT
 * fingerprinted so the same behavior can be replayed from local -> preview -> live.
 */
export interface UrlFixWitnessSpec {
  route: string;
  viewport: UrlFixViewport;
  preconditions: readonly string[];
  actions: readonly string[];
  expectedObservableResult: string;
}

export interface UrlFixArtifactRef {
  id: string;
  sha256: string;
}

export interface UrlFixWitnessRun {
  runId: string;
  witnessFingerprint: string;
  target: UrlFixTarget;
  targetUrl: string;
  runtimeIdentity: string | null;
  runtimeEvidenceRef: string | null;
  evidenceMode: UrlFixEvidenceMode;
  observedResult: string;
  trace: UrlFixArtifactRef | null;
  screenshot?: UrlFixArtifactRef | null;
}

export interface UrlFixVerificationReceipt {
  issueId: string;
  witnessSpec: UrlFixWitnessSpec;
  before: UrlFixWitnessRun;
  after: UrlFixWitnessRun;
}

export interface UrlFixUrlBinding {
  originalUrl: string;
  finalUrl: string;
  projectSlug: string;
  repository: string;
  ownership: UrlFixOwnershipState;
  ownershipEvidenceRefs: readonly string[];
  repairAuthorityReceiptRef: string | null;
  runtimeIdentity: string | null;
  deploymentProvider?: string | null;
  deploymentProject?: string | null;
}

/**
 * Trust facts must be supplied by the FCR authority/evidence layer, not copied
 * from arbitrary URLFix input. Empty sets fail closed.
 */
export interface UrlFixTrustContext {
  ownedOrigins: ReadonlySet<string>;
  verifiedOwnershipEvidenceRefs: ReadonlySet<string>;
  verifiedRepairAuthorityReceiptRefs: ReadonlySet<string>;
  verifiedArtifactIds: ReadonlySet<string>;
  verifiedRuntimeEvidenceRefs: ReadonlySet<string>;
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

function parseHttpsUrl(raw: string, label: string, errors: string[]): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    errors.push(`${label} URL is invalid`);
    return null;
  }
  if (parsed.protocol !== 'https:') errors.push(`${label} URL must use https`);
  if (parsed.username || parsed.password) errors.push(`${label} URL must not contain credentials`);
  return parsed;
}

function artifactVerified(ref: UrlFixArtifactRef | null | undefined, trusted: ReadonlySet<string>): boolean {
  return Boolean(ref?.id && /^[a-f0-9]{64}$/i.test(ref.sha256) && trusted.has(ref.id));
}

export function createUrlFixWitnessFingerprint(spec: UrlFixWitnessSpec): string {
  const canonical = JSON.stringify({
    route: spec.route.trim(),
    viewport: { width: spec.viewport.width, height: spec.viewport.height },
    preconditions: normalizeStringList(spec.preconditions),
    actions: normalizeStringList(spec.actions),
    expectedObservableResult: spec.expectedObservableResult.trim(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function isUrlFixFailurePlane(value: string): value is UrlFixFailurePlane {
  return (URLFIX_FAILURE_PLANES as readonly string[]).includes(value);
}

export function evaluateUrlFixUrlBinding(
  binding: UrlFixUrlBinding,
  trust: UrlFixTrustContext,
): UrlFixBindingDecision {
  const errors: string[] = [];
  const original = parseHttpsUrl(binding.originalUrl, 'original', errors);
  const final = parseHttpsUrl(binding.finalUrl, 'final', errors);
  const project = getPortfolioProject(binding.projectSlug);

  if (!project) errors.push('project is not authority-bearing in the active FCR portfolio registry');
  if (project && project.repository !== binding.repository) {
    errors.push('binding repository does not match the canonical FCR project repository');
  }
  if (binding.ownership !== 'OWNED_CONFIRMED') errors.push('ownership is not confirmed');
  if (binding.ownershipEvidenceRefs.length === 0) errors.push('ownership confirmation has no evidence reference');
  if (binding.ownershipEvidenceRefs.some((ref) => !trust.verifiedOwnershipEvidenceRefs.has(ref))) {
    errors.push('ownership evidence is not verified by FCR');
  }
  if (!binding.repairAuthorityReceiptRef || !trust.verifiedRepairAuthorityReceiptRefs.has(binding.repairAuthorityReceiptRef)) {
    errors.push('bounded repair authority receipt is not verified by FCR');
  }

  if (original && !trust.ownedOrigins.has(original.origin)) {
    errors.push('original URL origin is outside the FCR-confirmed owned origin set');
  }
  if (final && !trust.ownedOrigins.has(final.origin)) {
    errors.push('final URL origin is outside the FCR-confirmed owned origin set');
  }

  const sourceMutationAllowed = Boolean(
    project
      && project.repository === binding.repository
      && binding.ownership === 'OWNED_CONFIRMED'
      && binding.ownershipEvidenceRefs.length > 0
      && binding.repairAuthorityReceiptRef
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

function sameLiveBehaviorTarget(receipt: UrlFixVerificationReceipt, errors: string[]): void {
  let before: URL;
  let after: URL;
  try {
    before = new URL(receipt.before.targetUrl);
    after = new URL(receipt.after.targetUrl);
  } catch {
    errors.push('before and after target URLs must be valid');
    return;
  }

  if (before.protocol !== 'https:' || after.protocol !== 'https:') {
    errors.push('live witness URLs must use https');
  }
  if (before.origin !== after.origin) errors.push('live before/after witnesses must target the same origin');
  if (before.pathname !== receipt.witnessSpec.route || after.pathname !== receipt.witnessSpec.route) {
    errors.push('live before/after URLs must match the witness route');
  }
}

export function evaluateUrlFixVerificationReceipt(
  receipt: UrlFixVerificationReceipt,
  trust: Pick<UrlFixTrustContext, 'verifiedArtifactIds' | 'verifiedRuntimeEvidenceRefs'>,
): UrlFixReceiptDecision {
  const errors: string[] = [];
  const expectedFingerprint = createUrlFixWitnessFingerprint(receipt.witnessSpec);

  if (receipt.before.runId === receipt.after.runId) errors.push('before and after executions must have distinct run IDs');
  if (receipt.before.witnessFingerprint !== expectedFingerprint) errors.push('before run does not match the witness specification fingerprint');
  if (receipt.after.witnessFingerprint !== expectedFingerprint) errors.push('after run does not match the witness specification fingerprint');
  if (!artifactVerified(receipt.before.trace, trust.verifiedArtifactIds)) errors.push('before trace artifact is not independently verified');
  if (!artifactVerified(receipt.after.trace, trust.verifiedArtifactIds)) errors.push('after trace artifact is not independently verified');
  if (receipt.before.observedResult === receipt.witnessSpec.expectedObservableResult) errors.push('before run does not demonstrate the defect');
  if (receipt.after.observedResult !== receipt.witnessSpec.expectedObservableResult) errors.push('after run does not produce the expected observable result');

  const sameWitnessErrors = errors.filter((error) =>
    error.includes('witness specification') || error.includes('run IDs') || error.includes('trace artifact'),
  );
  const validSameWitness = sameWitnessErrors.length === 0;

  if (errors.length > 0) {
    return {
      validSameWitness,
      proofState: 'PATCHED',
      errors,
    };
  }

  if (receipt.after.target === 'LOCAL') {
    return { validSameWitness: true, proofState: 'LOCAL_BROWSER_PROVEN', errors: [] };
  }

  if (receipt.after.target === 'PREVIEW') {
    if (receipt.after.evidenceMode !== 'REAL') {
      return {
        validSameWitness: true,
        proofState: 'PATCHED_NOT_LIVE',
        errors: ['preview browser proof requires real, non-mocked dependencies'],
      };
    }
    return { validSameWitness: true, proofState: 'PREVIEW_BROWSER_PROVEN', errors: [] };
  }

  if (receipt.before.target !== 'LIVE') {
    return {
      validSameWitness: true,
      proofState: 'PATCHED_NOT_LIVE',
      errors: ['live proof requires a real live baseline of the same witness'],
    };
  }
  if (receipt.before.evidenceMode !== 'REAL' || receipt.after.evidenceMode !== 'REAL') {
    return {
      validSameWitness: true,
      proofState: 'PATCHED_NOT_LIVE',
      errors: ['live browser proof requires real, non-mocked before and after dependencies'],
    };
  }

  sameLiveBehaviorTarget(receipt, errors);
  if (!receipt.after.runtimeIdentity?.trim()) errors.push('live browser proof requires a known repaired runtime identity');
  if (!receipt.after.runtimeEvidenceRef || !trust.verifiedRuntimeEvidenceRefs.has(receipt.after.runtimeEvidenceRef)) {
    errors.push('live repaired runtime identity is not independently verified');
  }

  if (errors.length > 0) {
    return { validSameWitness: true, proofState: 'PATCHED_NOT_LIVE', errors };
  }

  return { validSameWitness: true, proofState: 'LIVE_BROWSER_PROVEN', errors: [] };
}
