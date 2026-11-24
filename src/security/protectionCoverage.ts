import { verify, type KeyObject } from 'node:crypto';

export type Coverage = 'UNKNOWN' | 'DEGRADED' | 'VERIFIED';
export interface CoverageTarget {
  service: string;
  version: string;
  observer: string;
  publicKey: KeyObject;
}
export interface CoverageProof {
  service: string;
  version: string;
  observer: string;
  observedAt: number;
  checks: { edge: boolean; public: boolean; private: boolean };
}
const MAX_AGE = 900_000;
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length
  && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const identity = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/.test(value);

export function coverageSigningBytes(proof: CoverageProof): Buffer {
  return Buffer.from(JSON.stringify(['fcr/protection-coverage@v1', proof.service,
    proof.version, proof.observer, proof.observedAt, proof.checks.edge,
    proof.checks.public, proof.checks.private]), 'utf8');
}

// Target identity, deployed version and observer key must come from trusted configuration,
// never from the service under test. Coverage is evidence only, not action authority.
export function evaluateProtectionCoverage(target: CoverageTarget, input: unknown, now = Date.now()): Coverage {
  try {
    if (!identity(target.service) || !identity(target.version) || !identity(target.observer)
      || target.service === target.observer || target.publicKey.type !== 'public'
      || target.publicKey.asymmetricKeyType !== 'ed25519' || !Number.isSafeInteger(now)) return 'UNKNOWN';
    if (!exact(input, ['service', 'version', 'observer', 'observedAt', 'checks', 'signature'])
      || input.service !== target.service || input.version !== target.version || input.observer !== target.observer
      || typeof input.observedAt !== 'number' || !Number.isSafeInteger(input.observedAt)
      || input.observedAt <= 0 || input.observedAt > now || now - input.observedAt > MAX_AGE
      || typeof input.signature !== 'string' || !/^[0-9a-f]{128}$/i.test(input.signature)
      || !exact(input.checks, ['edge', 'public', 'private'])) return 'UNKNOWN';
    const { edge, public: publicAccess, private: privateAccess } = input.checks;
    if (typeof edge !== 'boolean' || typeof publicAccess !== 'boolean' || typeof privateAccess !== 'boolean') return 'UNKNOWN';
    const proof: CoverageProof = { service: target.service, version: target.version, observer: target.observer,
      observedAt: input.observedAt, checks: { edge, public: publicAccess, private: privateAccess } };
    if (!verify(null, coverageSigningBytes(proof), target.publicKey, Buffer.from(input.signature, 'hex'))) return 'UNKNOWN';
    return edge && publicAccess && privateAccess ? 'VERIFIED' : 'DEGRADED';
  } catch {
    return 'UNKNOWN';
  }
}
