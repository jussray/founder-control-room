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
    orchestrationCannotWidenInteractiveAuthority: true,
  }),
});

type CapabilityFamily = 'terminal' | 'browser' | 'sandbox';

const FAMILY: Record<L99InteractiveCapability, CapabilityFamily> = {
  'terminal.read': 'terminal',
  'terminal.exec': 'terminal',
  'browser.open': 'browser',
  'browser.read': 'browser',
  'browser.interact': 'browser',
  'browser.external_mutation': 'browser',
  'sandbox.create': 'sandbox',
  'sandbox.read': 'sandbox',
  'sandbox.exec': 'sandbox',
  'sandbox.snapshot': 'sandbox',
  'sandbox.export': 'sandbox',
  'sandbox.destroy': 'sandbox',
};

const LEVEL: Record<L99InteractiveCapability, number> = {
  'terminal.read': 0,
  'browser.open': 0,
  'browser.read': 0,
  'sandbox.read': 0,
  'sandbox.create': 1,
  'browser.interact': 1,
  'sandbox.snapshot': 1,
  'terminal.exec': 2,
  'sandbox.exec': 2,
  'browser.external_mutation': 3,
  'sandbox.export': 3,
  'sandbox.destroy': 3,
};

const TERMINAL_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const FORBIDDEN_TERMINAL_OPERATION_ID = /^(?:sh|bash|zsh|fish|cmd(?:\.exe)?|powershell|pwsh)$/i;

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

export function interactiveEnvelopeIsSubset(
  child: L99InteractiveAuthorityEnvelope,
  parent: L99InteractiveAuthorityEnvelope,
): boolean {
  if (validateInteractiveEnvelope(parent).length > 0) return false;
  if (validateInteractiveEnvelope(child).length > 0) return false;

  if (FAMILY[child.capability] !== FAMILY[parent.capability]) return false;
  if (LEVEL[child.capability] > LEVEL[parent.capability]) return false;
  if (child.externalMutation && !parent.externalMutation) return false;

  if (
    child.capability === parent.capability
    && parent.requiresFounderReceipt
    && !child.requiresFounderReceipt
  ) return false;

  if (
    child.capability === parent.capability
    && parent.requiresPlaywrightProof
    && !child.requiresPlaywrightProof
  ) return false;

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

export function validateInteractiveEnvelope(
  envelope: L99InteractiveAuthorityEnvelope,
): string[] {
  const errors: string[] = [];
  const isSandbox = envelope.capability.startsWith('sandbox.');

  if (envelope.expiresAt !== null && !Number.isFinite(Date.parse(envelope.expiresAt))) {
    errors.push('expiresAt must be a valid timestamp');
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
