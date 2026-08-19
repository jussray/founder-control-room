export type L99InteractiveCapability =
  | 'terminal.read'
  | 'terminal.exec'
  | 'browser.open'
  | 'browser.read'
  | 'browser.interact'
  | 'browser.external_mutation';

export interface L99InteractiveAuthorityEnvelope {
  capability: L99InteractiveCapability;
  targetPatterns: string[];
  allowedOperations: string[];
  externalMutation: boolean;
  requiresFounderReceipt: boolean;
  requiresPlaywrightProof: boolean;
  expiresAt: string | null;
}

export const L99_INTERACTIVE_CAPABILITY_POLICY = Object.freeze({
  version: 'l99-interactive-v1',
  invariants: Object.freeze({
    terminalArbitraryShellForbidden: true,
    browserOpenIsNotMutationAuthority: true,
    browserExternalMutationRequiresFounderReceipt: true,
    uiRuntimeClaimsRequirePlaywrightProof: true,
    orchestrationCannotWidenInteractiveAuthority: true,
  }),
});

const LEVEL: Record<L99InteractiveCapability, number> = {
  'terminal.read': 0,
  'browser.open': 0,
  'browser.read': 0,
  'browser.interact': 1,
  'terminal.exec': 2,
  'browser.external_mutation': 3,
};

export function interactiveEnvelopeIsSubset(
  child: L99InteractiveAuthorityEnvelope,
  parent: L99InteractiveAuthorityEnvelope,
): boolean {
  if (LEVEL[child.capability] > LEVEL[parent.capability]) return false;
  if (child.externalMutation && !parent.externalMutation) return false;
  if (child.requiresFounderReceipt && !parent.requiresFounderReceipt && child.externalMutation) return false;

  const parentTargets = new Set(parent.targetPatterns);
  if (child.targetPatterns.some((target) => !parentTargets.has(target))) return false;

  const parentOperations = new Set(parent.allowedOperations);
  if (child.allowedOperations.some((operation) => !parentOperations.has(operation))) return false;

  return true;
}

export function validateInteractiveEnvelope(
  envelope: L99InteractiveAuthorityEnvelope,
): string[] {
  const errors: string[] = [];

  if (envelope.capability === 'terminal.exec' && envelope.allowedOperations.length === 0) {
    errors.push('terminal.exec requires an explicit command allowlist');
  }

  if (envelope.capability === 'browser.open' && envelope.externalMutation) {
    errors.push('browser.open cannot carry external mutation authority');
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

  return errors;
}
