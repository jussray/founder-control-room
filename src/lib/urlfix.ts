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
export type UrlFixBrowser = 'chromium';
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
 * Route means pathname + query + fragment because SPA/hash/query state can be causal.
 */
export interface UrlFixWitnessSpec {
  route: string;
  browser: UrlFixBrowser;
  viewport: UrlFixViewport;
  preconditions: readonly string[];
  actions: readonly string[];
  expectedObservableResult: string;
  expectationEvidenceRef: string;
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

export interface UrlFixTrustedUrlBinding {
  origin: string;
  projectSlug: string;
  repository: string;
  evidenceRef: string;
}

export interface UrlFixTrustedRepairAuthority {
  receiptRef: string;
  projectSlug: string;
  repository: string;
}

export interface UrlFixTrustedRuntimeEvidence {
  ref: string;
  runtimeIdentity: string;
  origin: string;
}

export interface UrlFixTrustedExpectationEvidence {
  ref: string;
  route: string;
  browser: UrlFixBrowser;
  expectedObservableResult: string;
}

export interface UrlFixVerificationTrustContext {
  verifiedArtifacts: ReadonlyMap<string, string>;
  verifiedRuntimeEvidence: readonly UrlFixTrustedRuntimeEvidence[];
  verifiedWitnessRuns: readonly UrlFixWitnessRun[];
  verifiedExpectations: readonly UrlFixTrustedExpectationEvidence[];
}

/**
 * Trust facts must be supplied by the FCR authority/evidence layer, not copied
 * from arbitrary URLFix input. Every trusted fact is tuple-bound so unrelated
 * true facts cannot be recombined into false authority or proof.
 */
export interface UrlFixTrustContext extends UrlFixVerificationTrustContext {
  verifiedUrlBindings: readonly UrlFixTrustedUrlBinding[];
  verifiedRepairAuthorities: readonly UrlFixTrustedRepairAuthority[];
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

function browserRoute(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function artifactEqual(left: UrlFixArtifactRef | null | undefined, right: UrlFixArtifactRef | null | undefined): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.id === right.id && left.sha256.toLowerCase() === right.sha256.toLowerCase();
}

function artifactVerified(ref: UrlFixArtifactRef | null | undefined, trusted: ReadonlyMap<string, string>): boolean {
  if (!ref?.id || !/^[a-f0-9]{64}$/i.test(ref.sha256)) return false;
  const trustedHash = trusted.get(ref.id);
  return Boolean(trustedHash && trustedHash.toLowerCase() === ref.sha256.toLowerCase());
}

function witnessRunVerified(run: UrlFixWitnessRun, trustedRuns: readonly UrlFixWitnessRun[]): boolean {
  return trustedRuns.some((trusted) =>
    trusted.runId === run.runId
      && trusted.witnessFingerprint === run.witnessFingerprint
      && trusted.target === run.target
      && trusted.targetUrl === run.targetUrl
      && trusted.runtimeIdentity === run.runtimeIdentity
      && trusted.runtimeEvidenceRef === run.runtimeEvidenceRef
      && trusted.evidenceMode === run.evidenceMode
      && trusted.observedResult === run.observedResult
      && artifactEqual(trusted.trace, run.trace)
      && artifactEqual(trusted.screenshot, run.screenshot),
  );
}

function expectationVerified(
  spec: UrlFixWitnessSpec,
  trustedExpectations: readonly UrlFixTrustedExpectationEvidence[],
): boolean {
  return trustedExpectations.some((trusted) =>
    trusted.ref === spec.expectationEvidenceRef
      && trusted.route === spec.route
      && trusted.browser === spec.browser
      && trusted.expectedObservableResult === spec.expectedObservableResult,
  );
}

function originBindingVerified(
  origin: string,
  binding: UrlFixUrlBinding,
  trust: UrlFixTrustContext,
): boolean {
  return trust.verifiedUrlBindings.some((trusted) =>
    trusted.origin === origin
      && trusted.projectSlug === binding.projectSlug
      && trusted.repository === binding.repository
      && binding.ownershipEvidenceRefs.includes(trusted.evidenceRef),
  );
}

function repairAuthorityVerified(binding: UrlFixUrlBinding, trust: UrlFixTrustContext): boolean {
  if (!binding.repairAuthorityReceiptRef) return false;
  return trust.verifiedRepairAuthorities.some((trusted) =>
    trusted.receiptRef === binding.repairAuthorityReceiptRef
      && trusted.projectSlug === binding.projectSlug
      && trusted.repository === binding.repository,
  );
}

function runtimeEvidenceVerified(run: UrlFixWitnessRun, trust: Pick<UrlFixVerificationTrustContext, 'verifiedRuntimeEvidence'>): boolean {
  if (!run.runtimeEvidenceRef || !run.runtimeIdentity?.trim()) return false;
  let origin: string;
  try {
    origin = new URL(run.targetUrl).origin;
  } catch {
    return false;
  }
  return trust.verifiedRuntimeEvidence.some((trusted) =>
    trusted.ref === run.runtimeEvidenceRef
      && trusted.runtimeIdentity === run.runtimeIdentity
      && trusted.origin === origin,
  );
}

function validateRunBehaviorTarget(
  run: UrlFixWitnessRun,
  spec: UrlFixWitnessSpec,
  label: 'before' | 'after',
  errors: string[],
): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(run.targetUrl);
  } catch {
    errors.push(`${label} target URL is invalid`);
    return null;
  }

  if (parsed.username || parsed.password) errors.push(`${label} target URL must not contain credentials`);
  if (run.target !== 'LOCAL' && parsed.protocol !== 'https:') {
    errors.push(`${label} ${run.target.toLowerCase()} target URL must use https`);
  }
  if (browserRoute(parsed) !== spec.route) {
    errors.push(`${label} target URL does not match the full witness route including query and fragment`);
  }
  return parsed;
}

export function createUrlFixWitnessFingerprint(spec: UrlFixWitnessSpec): string {
  const canonical = JSON.stringify({
    route: spec.route.trim(),
    browser: spec.browser,
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

  if (original && !originBindingVerified(original.origin, binding, trust)) {
    errors.push('original URL origin is not tuple-bound to this project/repository by verified FCR evidence');
  }
  if (final && !originBindingVerified(final.origin, binding, trust)) {
    errors.push('final URL origin is not tuple-bound to this project/repository by verified FCR evidence');
  }
  if (!repairAuthorityVerified(binding, trust)) {
    errors.push('bounded repair authority receipt is not tuple-bound to this project/repository by FCR');
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

export function evaluateUrlFixVerificationReceipt(
  receipt: UrlFixVerificationReceipt,
  trust: UrlFixVerificationTrustContext,
): UrlFixReceiptDecision {
  const errors: string[] = [];
  const expectedFingerprint = createUrlFixWitnessFingerprint(receipt.witnessSpec);
  const beforeUrl = validateRunBehaviorTarget(receipt.before, receipt.witnessSpec, 'before', errors);
  const afterUrl = validateRunBehaviorTarget(receipt.after, receipt.witnessSpec, 'after', errors);

  if (!expectationVerified(receipt.witnessSpec, trust.verifiedExpectations)) {
    errors.push('expected observable result is not bound to trusted expectation evidence');
  }
  if (!witnessRunVerified(receipt.before, trust.verifiedWitnessRuns)) {
    errors.push('before witness run receipt is not independently verified');
  }
  if (!witnessRunVerified(receipt.after, trust.verifiedWitnessRuns)) {
    errors.push('after witness run receipt is not independently verified');
  }
  if (receipt.before.runId === receipt.after.runId) errors.push('before and after executions must have distinct run IDs');
  if (receipt.before.trace?.id && receipt.after.trace?.id && receipt.before.trace.id === receipt.after.trace.id) {
    errors.push('before and after executions must have distinct trace artifacts');
  }
  if (receipt.before.witnessFingerprint !== expectedFingerprint) errors.push('before run does not match the witness specification fingerprint');
  if (receipt.after.witnessFingerprint !== expectedFingerprint) errors.push('after run does not match the witness specification fingerprint');
  if (!artifactVerified(receipt.before.trace, trust.verifiedArtifacts)) errors.push('before trace artifact id/hash is not independently verified');
  if (!artifactVerified(receipt.after.trace, trust.verifiedArtifacts)) errors.push('after trace artifact id/hash is not independently verified');
  if (receipt.before.observedResult === receipt.witnessSpec.expectedObservableResult) errors.push('before run does not demonstrate the defect');
  if (receipt.after.observedResult !== receipt.witnessSpec.expectedObservableResult) errors.push('after run does not produce the expected observable result');

  const sameWitnessErrors = errors.filter((error) =>
    error.includes('witness specification')
      || error.includes('run IDs')
      || error.includes('trace artifact')
      || error.includes('witness route')
      || error.includes('witness run receipt'),
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
    if (!receipt.after.runtimeIdentity?.trim() || !runtimeEvidenceVerified(receipt.after, trust)) {
      return {
        validSameWitness: true,
        proofState: 'PATCHED_NOT_LIVE',
        errors: ['preview browser proof requires an independently verified preview runtime identity'],
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

  if (beforeUrl && afterUrl && beforeUrl.origin !== afterUrl.origin) {
    errors.push('live before/after witnesses must target the same origin');
  }
  if (!receipt.before.runtimeIdentity?.trim() || !runtimeEvidenceVerified(receipt.before, trust)) {
    errors.push('live baseline runtime identity is not independently verified for its origin');
  }
  if (!receipt.after.runtimeIdentity?.trim() || !runtimeEvidenceVerified(receipt.after, trust)) {
    errors.push('live repaired runtime identity is not independently verified for its origin');
  }

  if (errors.length > 0) {
    return { validSameWitness: true, proofState: 'PATCHED_NOT_LIVE', errors };
  }

  return { validSameWitness: true, proofState: 'LIVE_BROWSER_PROVEN', errors: [] };
}
