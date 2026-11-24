import { FINGERPRINT_VERSION, type FingerprintVersion } from './session-types.js';

export type FingerprintSignalName =
  | 'tlsVersion'
  | 'tlsCipher'
  | 'clientHelloLength'
  | 'uaFamily'
  | 'acceptLanguage'
  | 'platform'
  | 'ja4';

/**
 * Privacy-minimized, already-normalized request characteristics accepted by
 * the pure fingerprint membrane. Raw User-Agent, IP, ASN, country, exact
 * geolocation, and device/hardware identifiers are deliberately absent.
 */
export interface ApprovedFingerprintSignals {
  tlsVersion?: string | null;
  tlsCipher?: string | null;
  clientHelloLength?: number | null;
  uaFamily?: string | null;
  acceptLanguage?: string | null;
  platform?: string | null;
  ja4?: string | null;
}

export interface FingerprintBindingResult {
  fingerprintHash: string;
  signalAvailability: readonly FingerprintSignalName[];
  signalVersion: FingerprintVersion;
}

const SIGNAL_ORDER: readonly FingerprintSignalName[] = [
  'tlsVersion',
  'tlsCipher',
  'clientHelloLength',
  'uaFamily',
  'acceptLanguage',
  'platform',
  'ja4',
] as const;

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeClientHelloLength(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  return String(value);
}

function normalizedSignals(signals: ApprovedFingerprintSignals): Record<FingerprintSignalName, string | null> {
  return {
    tlsVersion: normalizeText(signals.tlsVersion),
    tlsCipher: normalizeText(signals.tlsCipher),
    clientHelloLength: normalizeClientHelloLength(signals.clientHelloLength),
    uaFamily: normalizeText(signals.uaFamily),
    acceptLanguage: normalizeText(signals.acceptLanguage),
    platform: normalizeText(signals.platform),
    ja4: normalizeText(signals.ja4),
  };
}

function canonicalMaterial(signals: ApprovedFingerprintSignals): {
  material: string;
  signalAvailability: FingerprintSignalName[];
} {
  const normalized = normalizedSignals(signals);
  const signalAvailability = SIGNAL_ORDER.filter((name) => normalized[name] !== null);
  const fields = SIGNAL_ORDER.map((name) => `${name}=${normalized[name] ?? '~'}`);
  return {
    material: [FINGERPRINT_VERSION, ...fields].join('\n'),
    signalAvailability,
  };
}

function base64Url(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let output = '';

  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset] ?? 0;
    const b = bytes[offset + 1] ?? 0;
    const c = bytes[offset + 2] ?? 0;
    const remaining = bytes.length - offset;
    const value = (a << 16) | (b << 8) | c;

    output += alphabet[(value >>> 18) & 63];
    output += alphabet[(value >>> 12) & 63];
    if (remaining > 1) output += alphabet[(value >>> 6) & 63];
    if (remaining > 2) output += alphabet[value & 63];
  }

  return output;
}

/**
 * Derive the v0 continuity binding with keyed HMAC-SHA-256.
 *
 * The secret and already-approved signal object are explicit inputs. This
 * module does not read Request, cookies, environment state, time, storage, or
 * FCR authority. Only the HMAC result and bounded availability metadata leave
 * the module; raw canonical material is never returned.
 */
export async function fingerprintBinding(
  signals: ApprovedFingerprintSignals,
  secret: string,
): Promise<FingerprintBindingResult> {
  const secretBytes = new TextEncoder().encode(secret);
  if (secretBytes.byteLength < 32) {
    throw new Error('Fingerprint HMAC secret must be at least 32 bytes');
  }

  const { material, signalAvailability } = canonicalMaterial(signals);
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(material),
  );

  return {
    fingerprintHash: base64Url(new Uint8Array(signature)),
    signalAvailability,
    signalVersion: FINGERPRINT_VERSION,
  };
}
