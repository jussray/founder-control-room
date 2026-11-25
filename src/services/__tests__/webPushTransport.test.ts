import { describe, expect, it } from 'vitest';
import { createECDH, createPublicKey, verify } from 'node:crypto';
import { encryptWebPush, normalizePushSubscription, sealSubscription, unsealSubscription, vapidHeader } from '../webPushTransport.js';

const key = createECDH('prime256v1');
key.generateKeys();
const subscription = { endpoint: 'https://web.push.apple.com/test', keys: { p256dh: key.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 9).toString('base64url') } };
const storage = Buffer.alloc(32, 8).toString('base64url');

describe('founder web push', () => {
  it('restricts destinations and requires valid subscription keys', () => {
    expect(normalizePushSubscription(subscription)).toEqual(subscription);
    for (const endpoint of ['http://web.push.apple.com/a','https://web.push.apple.com.evil.test/a','https://127.0.0.1/a','https://user@web.push.apple.com/a','https://web.push.apple.com:444/a']) {
      expect(() => normalizePushSubscription({ ...subscription, endpoint })).toThrow();
    }
    expect(() => normalizePushSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'bad' } })).toThrow();
  });
  // The encoded values below are public known-answer vectors from RFC 8291
  // Section 5 and Appendix A, not application credentials. Keep them exact
  // to detect cryptographic interoperability regressions.
  it('matches the RFC 8291 ciphertext example', () => {
    const receiver = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
    const sender = Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw','base64url');
    const salt = Buffer.from('DGv6ra1nlYgDCS1FRnbzlw','base64url');
    const plaintext = Buffer.from('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24','base64url');
    const body = encryptWebPush(receiver, plaintext, sender, salt);
    expect(body.subarray(86).toString('base64url')).toBe('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ');
  });
  it('encrypts subscriptions at rest and binds them to the founder identity', () => {
    const encrypted = sealSubscription(subscription, storage, 'founder-a');
    expect(encrypted).not.toContain(subscription.endpoint);
    expect(unsealSubscription(encrypted, storage, 'founder-a')).toEqual(subscription);
    expect(() => unsealSubscription(encrypted, storage, 'founder-b')).toThrow();
  });
  it('produces a verifiable VAPID signature scoped to the push origin', () => {
    const privateKey = Buffer.alloc(32, 1).toString('base64url');
    const header = vapidHeader(privateKey, subscription.endpoint, 'https://foundercontrolroom.org', 1700000000);
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    const [head, payload, signature] = match[1].split('.');
    const publicKey = Buffer.from(match[2], 'base64url');
    const jwk = { kty: 'EC', crv: 'P-256', x: publicKey.subarray(1,33).toString('base64url'), y: publicKey.subarray(33).toString('base64url') };
    expect(verify('sha256', Buffer.from(head + '.' + payload), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(payload,'base64url').toString()).aud).toBe('https://web.push.apple.com');
  });
});
