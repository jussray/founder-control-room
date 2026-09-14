export interface ReasoningStateRevalidationOptions<T> {
  before: T;
  after: T;
  fingerprint: (state: T) => string;
  label?: string;
}

export class ReasoningStateChangedError extends Error {
  readonly code = 'REASONING_STATE_CHANGED';
  readonly beforeFingerprint: string;
  readonly afterFingerprint: string;

  constructor(input: { label?: string; beforeFingerprint: string; afterFingerprint: string }) {
    const label = input.label?.trim() || 'reasoning input';
    super(`${label} changed while reasoning was in flight`);
    this.name = 'ReasoningStateChangedError';
    this.beforeFingerprint = input.beforeFingerprint;
    this.afterFingerprint = input.afterFingerprint;
  }
}

/**
 * Consequential reasoning must be accepted against the state the model
 * actually observed, not merely the state that exists when the result is
 * ready to be stored or acted on.
 *
 * Callers own the semantic fingerprint so they can bind only the fields
 * that were actually supplied to the reasoner. A changed fingerprint fails
 * closed by throwing before the result may be applied.
 */
export function assertReasoningStateStillCurrent<T>(
  options: ReasoningStateRevalidationOptions<T>,
): string {
  const beforeFingerprint = options.fingerprint(options.before);
  const afterFingerprint = options.fingerprint(options.after);

  if (!beforeFingerprint || !afterFingerprint) {
    throw new Error('reasoning-state fingerprint must be a non-empty string');
  }

  if (beforeFingerprint !== afterFingerprint) {
    throw new ReasoningStateChangedError({
      label: options.label,
      beforeFingerprint,
      afterFingerprint,
    });
  }

  return afterFingerprint;
}
