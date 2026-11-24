import { describe, expect, it } from 'vitest';
import { fingerprintBinding, type ApprovedFingerprintSignals } from '../fingerprint.js';

const SECRET = 'fcr-fpv1-test-secret-000000000000000000000000';
const OTHER_SECRET = 'fcr-fpv1-test-secret-111111111111111111111111';

const SIGNALS: ApprovedFingerprintSignals = {
  tlsVersion: 'TLSv1.3',
  tlsCipher: 'AEAD-AES128-GCM-SHA256',
  clientHelloLength: 517,
  uaFamily: 'Chrome',
  acceptLanguage: 'en-US, en;q=0.9',
  platform: 'iOS',
  ja4: null,
};

describe('fpv1 HMAC continuity binding', () => {
  it('is deterministic for the same approved signals and explicit secret', async () => {
    const first = await fingerprintBinding(SIGNALS, SECRET);
    const second = await fingerprintBinding({ ...SIGNALS }, SECRET);

    expect(second).toEqual(first);
    expect(first.signalVersion).toBe('fpv1');
    expect(first.fingerprintHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('is independent of caller object property order', async () => {
    const reordered: ApprovedFingerprintSignals = {
      platform: 'iOS',
      uaFamily: 'Chrome',
      clientHelloLength: 517,
      tlsCipher: 'AEAD-AES128-GCM-SHA256',
      tlsVersion: 'TLSv1.3',
      acceptLanguage: 'en-US, en;q=0.9',
      ja4: null,
    };

    expect((await fingerprintBinding(reordered, SECRET)).fingerprintHash)
      .toBe((await fingerprintBinding(SIGNALS, SECRET)).fingerprintHash);
  });

  it('normalizes approved textual signals before binding', async () => {
    const equivalent: ApprovedFingerprintSignals = {
      ...SIGNALS,
      tlsVersion: '  tlsV1.3 ',
      tlsCipher: 'aead-aes128-gcm-sha256',
      uaFamily: ' chrome ',
      acceptLanguage: 'EN-US,   EN;Q=0.9',
      platform: 'ios',
    };

    expect((await fingerprintBinding(equivalent, SECRET)).fingerprintHash)
      .toBe((await fingerprintBinding(SIGNALS, SECRET)).fingerprintHash);
  });

  it('tolerates missing optional Cloudflare/JA4-style metadata deterministically', async () => {
    const sparse: ApprovedFingerprintSignals = {
      uaFamily: 'Safari',
      platform: 'iOS',
    };

    const first = await fingerprintBinding(sparse, SECRET);
    const second = await fingerprintBinding(sparse, SECRET);

    expect(first).toEqual(second);
    expect(first.signalAvailability).toEqual(['uaFamily', 'platform']);
  });

  it('keeps ASN, country, and raw IP outside the binding by construction', async () => {
    const networkDecorated = {
      ...SIGNALS,
      asn: 21928,
      country: 'US',
      ip: '203.0.113.42',
    } as ApprovedFingerprintSignals & { asn: number; country: string; ip: string };

    const baseline = await fingerprintBinding(SIGNALS, SECRET);
    const decorated = await fingerprintBinding(networkDecorated, SECRET);

    expect(decorated.fingerprintHash).toBe(baseline.fingerprintHash);
    expect(decorated.signalAvailability).toEqual(baseline.signalAvailability);
  });

  it('changes the binding when an approved continuity signal changes', async () => {
    const changed = await fingerprintBinding({ ...SIGNALS, platform: 'macOS' }, SECRET);
    const baseline = await fingerprintBinding(SIGNALS, SECRET);

    expect(changed.fingerprintHash).not.toBe(baseline.fingerprintHash);
  });

  it('rotates the binding when the explicit HMAC secret changes', async () => {
    const baseline = await fingerprintBinding(SIGNALS, SECRET);
    const rotated = await fingerprintBinding(SIGNALS, OTHER_SECRET);

    expect(rotated.fingerprintHash).not.toBe(baseline.fingerprintHash);
  });

  it('rejects undersized HMAC secrets instead of silently weakening the key', async () => {
    await expect(fingerprintBinding(SIGNALS, 'too-short')).rejects.toThrow(
      'Fingerprint HMAC secret must be at least 32 bytes',
    );
  });
});
