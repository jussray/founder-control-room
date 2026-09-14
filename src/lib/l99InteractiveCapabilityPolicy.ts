export type L99InteractiveCapability =
  | 'terminal.read'
  | 'terminal.exec'
  | 'browser.open'
  | 'browser.read'
  | 'browser.interact'
  | 'browser.external_mutation'
  | 'sandbox.create'
  | 'sandbox.read'
  | 'sandbox.exec'
  | 'sandbox.snapshot'
  | 'sandbox.export'
  | 'sandbox.destroy';

export interface L99FingerprintBinding {
  inputFingerprint: string | null;
  environmentFingerprint: string | null;
  outputFingerprint: string | null;
}

export interface L99SandboxIsolation {
  networkAccess: boolean;
  secretsAccess: boolean;
  productionAccess: boolean;
  persistentStorage: boolean;
}

export interface L99InteractiveAuthorityEnvelope {
  capability: L99InteractiveCapability;
  targetPatterns: string[];
  allowedOperations: string[];
  externalMutation: boolean;
  requiresFounderReceipt: boolean;
  requiresPlaywrightProof: boolean;
  fingerprints: L99FingerprintBinding;
  sandboxIsolation: L99SandboxIsolation | null;
  expiresAt: string | null;
}

export const L99_INTERACTIVE_CAPABILITY_POLICY = Object.freeze({
  version: 'l99-interactive-v2',
  invariants: Object.freeze({
    terminalArbitraryShellForbidden: true,
    browserOpenIsNotMutationAuthority: true,
    browserExternalMutationRequiresFounderReceipt: true,
    uiRuntimeClaimsRequirePlaywrightProof: true,
    sandboxStartsWithZeroAmbientAuthority: true,
    sandboxExecRequiresExactInputAndEnvironmentFingerprints: true,
    sandboxExportRequiresFounderReceiptAndOutputFingerprint: true,
    sandboxDestroyRequiresFounderReceipt: true,
    fingerprintsProveIdentityNotAuthority: true,
    fingerprintsAreSha256: true,
    orchestrationCannotWidenInteractiveAuthority: true,
    derivationPreservesExactCapability: true,
    mutationClassificationCannotBeDowngraded: true,
    runtimeShapeFailsClosed: true,
  }),
});

const CAPABILITIES = new Set<string>([
  'terminal.read',
  'terminal.exec',
  'browser.open',
  'browser.read',
  'browser.interact',
  'browser.external_mutation',
  'sandbox.create',
  'sandbox.read',
  'sandbox.exec',
  'sandbox.snapshot',
  'sandbox.export',
  'sandbox.destroy',
]);
const ENVELOPE_FIELDS = new Set([
  'capability',
  'targetPatterns',
  'allowedOperations',
  'externalMutation',
  'requiresFounderReceipt',
  'requiresPlaywrightProof',
  'fingerprints',
  'sandboxIsolation',
  'expiresAt',
]);
const FINGERPRINT_FIELDS = new Set([
  'inputFingerprint',
  'environmentFingerprint',
  'outputFingerprint',
]);
const ISOLATION_FIELDS = new Set([
  'networkAccess',
  'secretsAccess',
  'productionAccess',
  'persistentStorage',
]);
const SHA256 = /^[0-9a-f]{64}$/i;
const TERMINAL_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FORBIDDEN_TERMINAL_OPERATION_ID = /^(?:sh|bash|zsh|fish|cmd(?:\.exe)?|powershell|pwsh)(?:$|[._:-])/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFingerprintBinding(value: unknown): value is L99FingerprintBinding {
  if (!isRecord(value) || !hasOnlyFields(value, FINGERPRINT_FIELDS)) return false;
  return isNullableString(value.inputFingerprint)
    && isNullableString(value.environmentFingerprint)
    && isNullableString(value.outputFingerprint);
}

function isSandboxIsolation(value: unknown): value is L99SandboxIsolation {
  if (!isRecord(value) || !hasOnlyFields(value, ISOLATION_FIELDS)) return false;
  return typeof value.networkAccess === 'boolean'
    && typeof value.secretsAccess === 'boolean'
    && typeof value.productionAccess === 'boolean'
    && typeof value.persistentStorage === 'boolean';
}

export function isL99InteractiveAuthorityEnvelope(value: unknown): value is L99InteractiveAuthorityEnvelope {
  if (!isRecord(value) || !hasOnlyFields(value, ENVELOPE_FIELDS)) return false;
  return typeof value.capability === 'string'
    && CAPABILITIES.has(value.capability)
    && isStringArray(value.targetPatterns)
    && isStringArray(value.allowedOperations)
    && typeof value.externalMutation === 'boolean'
    && typeof value.requiresFounderReceipt === 'boolean'
    && typeof value.requiresPlaywrightProof === 'boolean'
    && isFingerprintBinding(value.fingerprints)
    && (value.sandboxIsolation === null || isSandboxIsolation(value.sandboxIsolation))
    && (value.expiresAt === null || typeof value.expiresAt === 'string');
}

function fingerprintIsSubset(child: string | null, parent: string | null): boolean {
  if (parent === null) return true;
  return child === parent;
}

function isolationIsSubset(child: L99SandboxIsolation | null, parent: L99SandboxIsolation | null): boolean {
  if (child === null) return parent === null;
  if (parent === null) {
    return !child.networkAccess
      && !child.secretsAccess
      && !child.productionAccess
      && !child.persistentStorage;
  }

  if (child.networkAccess && !parent.networkAccess) return false;
  if (child.secretsAccess && !parent.secretsAccess) return false;
  if (child.productionAccess && !parent.productionAccess) return false;
  if (child.persistentStorage && !parent.persistentStorage) return false;
  return true;
}

function expiryIsSubset(child: string | null, parent: string | null): boolean {
  if (parent === null) return true;
  if (child === null) return false;

  const childTime = Date.parse(child);
  const parentTime = Date.parse(parent);
  if (!Number.isFinite(childTime) || !Number.isFinite(parentTime)) return false;
  return childTime <= parentTime;
}

function hasSandboxAmbientAuthority(isolation: L99SandboxIsolation | null): boolean {
  return Boolean(
    isolation
      && (
        isolation.networkAccess
        || isolation.secretsAccess
        || isolation.productionAccess
        || isolation.persistentStorage
      ),
  );
}

function validateFingerprints(fingerprints: L99FingerprintBinding): string[] {
  const errors: string[] = [];
  const entries: Array<[keyof L99FingerprintBinding, string | null]> = [
    ['inputFingerprint', fingerprints.inputFingerprint],
    ['environmentFingerprint', fingerprints.environmentFingerprint],
    ['outputFingerprint', fingerprints.outputFingerprint],
  ];

  for (const [name, value] of entries) {
    if (value !== null && !SHA256.test(value)) {
      errors.push(`${name} must be a 64-hex sha256 fingerprint`);
    }
  }

  return errors;
}

export function interactiveEnvelopeIsSubset(
  child: L99InteractiveAuthorityEnvelope,
  parent: L99InteractiveAuthorityEnvelope,
): boolean {
  if (validateInteractiveEnvelope(parent).length > 0) return false;
  if (validateInteractiveEnvelope(child).length > 0) return false;

  // A capability is a typed authority boundary, not a scalar rank. Derivation may
  // narrow scope inside one capability, but changing capability requires a new grant.
  if (child.capability !== parent.capability) return false;

  // Mutation classification is security metadata, not optional decoration. A child
  // may not hide or change the parent's external side-effect classification.
  if (child.externalMutation !== parent.externalMutation) return false;

  if (parent.requiresFounderReceipt && !child.requiresFounderReceipt) return false;
  if (parent.requiresPlaywrightProof && !child.requiresPlaywrightProof) return false;

  const parentTargets = new Set(parent.targetPatterns);
  if (child.targetPatterns.some((target) => !parentTargets.has(target))) return false;

  const parentOperations = new Set(parent.allowedOperations);
  if (child.allowedOperations.some((operation) => !parentOperations.has(operation))) return false;

  if (!fingerprintIsSubset(child.fingerprints.inputFingerprint, parent.fingerprints.inputFingerprint)) return false;
  if (!fingerprintIsSubset(child.fingerprints.environmentFingerprint, parent.fingerprints.environmentFingerprint)) return false;
  if (!fingerprintIsSubset(child.fingerprints.outputFingerprint, parent.fingerprints.outputFingerprint)) return false;
  if (!isolationIsSubset(child.sandboxIsolation, parent.sandboxIsolation)) return false;
  if (!expiryIsSubset(child.expiresAt, parent.expiresAt)) return false;

  return true;
}

export function validateInteractiveEnvelope(envelope: unknown): string[] {
  if (!isL99InteractiveAuthorityEnvelope(envelope)) {
    return ['interactive authority envelope shape is invalid'];
  }

  const errors: string[] = [];
  const isSandbox = envelope.capability.startsWith('sandbox.');

  if (envelope.targetPatterns.length === 0 || envelope.targetPatterns.some((target) => !target.trim())) {
    errors.push('interactive authority requires at least one non-blank target pattern');
  }

  if (envelope.allowedOperations.length === 0 || envelope.allowedOperations.some((operation) => !operation.trim())) {
    errors.push('interactive authority requires at least one non-blank allowed operation');
  }

  errors.push(...validateFingerprints(envelope.fingerprints));

  if (envelope.expiresAt !== null) {
    const expiresAt = Date.parse(envelope.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      errors.push('expiresAt must be a valid timestamp');
    } else if (expiresAt <= Date.now()) {
      errors.push('expiresAt must be in the future');
    }
  }

  if (envelope.capability === 'terminal.exec' && envelope.allowedOperations.length === 0) {
    errors.push('terminal.exec requires an explicit command allowlist');
  }

  if (
    envelope.capability === 'terminal.exec'
    && envelope.allowedOperations.some(
      (operation) => !TERMINAL_OPERATION_ID.test(operation) || FORBIDDEN_TERMINAL_OPERATION_ID.test(operation),
    )
  ) {
    errors.push('terminal.exec allowlist must contain bounded operation ids, not arbitrary shell commands');
  }

  if (
    envelope.capability.startsWith('browser.')
    && envelope.capability !== 'browser.external_mutation'
    && envelope.externalMutation
  ) {
    errors.push('browser external mutation must use browser.external_mutation');
  }

  if (envelope.capability === 'browser.external_mutation' && !envelope.externalMutation) {
    errors.push('browser.external_mutation must be classified as an external mutation');
  }

  if (envelope.externalMutation && !envelope.requiresFounderReceipt) {
    errors.push('external mutation requires a founder receipt');
  }

  if (envelope.capability === 'browser.external_mutation' && !envelope.requiresFounderReceipt) {
    errors.push('browser external mutation requires a founder receipt');
  }

  if (
    ['browser.interact', 'browser.external_mutation'].includes(envelope.capability)
    && !envelope.requiresPlaywrightProof
  ) {
    errors.push('interactive browser authority requires Playwright proof');
  }

  if (isSandbox && envelope.sandboxIsolation === null) {
    errors.push('sandbox capability requires an explicit isolation envelope');
  }

  if (!isSandbox && envelope.sandboxIsolation !== null) {
    errors.push('non-sandbox capability cannot carry sandbox isolation authority');
  }

  if (
    envelope.capability === 'sandbox.create'
    && hasSandboxAmbientAuthority(envelope.sandboxIsolation)
  ) {
    errors.push('sandbox.create must start with zero ambient authority');
  }

  if (
    isSandbox
    && hasSandboxAmbientAuthority(envelope.sandboxIsolation)
    && !envelope.requiresFounderReceipt
  ) {
    errors.push('sandbox ambient authority requires a founder receipt');
  }

  if (
    envelope.capability === 'sandbox.exec'
    && (!envelope.fingerprints.inputFingerprint || !envelope.fingerprints.environmentFingerprint)
  ) {
    errors.push('sandbox.exec requires exact input and environment fingerprints');
  }

  if (envelope.capability === 'sandbox.exec' && envelope.allowedOperations.length === 0) {
    errors.push('sandbox.exec requires an explicit execution allowlist');
  }

  if (envelope.capability === 'sandbox.export' && !envelope.externalMutation) {
    errors.push('sandbox.export must be classified as an external mutation');
  }

  if (
    envelope.capability === 'sandbox.export'
    && (!envelope.requiresFounderReceipt || !envelope.fingerprints.outputFingerprint)
  ) {
    errors.push('sandbox.export requires founder receipt and exact output fingerprint');
  }

  if (envelope.capability === 'sandbox.destroy' && !envelope.requiresFounderReceipt) {
    errors.push('sandbox.destroy requires a founder receipt');
  }

  return errors;
}
