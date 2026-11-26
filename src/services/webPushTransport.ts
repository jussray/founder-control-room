import { createCipheriv, createDecipheriv, createECDH, createHash, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_subscription');
  return value as Record<string, unknown>;
}
function bytes(value: unknown, length: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_key');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== length || decoded.toString('base64url') !== value) throw new Error('invalid_key');
  return decoded;
}
function allowedEndpoint(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('invalid_endpoint');
  const url = new URL(value);
  const host = url.hostname;
  const allowed = host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
    host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com';
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.pathname === '/') throw new Error('invalid_endpoint');
  return url;
}
export function normalizePushSubscription(value: unknown): WebPushSubscription {
  const obj = record(value), keys = record(obj.keys);
  const endpoint = allowedEndpoint(obj.endpoint).toString();
  const publicKey = bytes(keys.p256dh, 65);
  if (publicKey[0] !== 4) throw new Error('invalid_public_key');
  // Validates that the supplied point is actually on P-256.
  const validator = createECDH('prime256v1');
  validator.generateKeys();
  validator.computeSecret(publicKey);
  return { endpoint, keys: { p256dh: publicKey.toString('base64url'), auth: bytes(keys.auth, 16).toString('base64url') } };
}

export function subscriptionFingerprint(endpoint: string): string {
  return createHash('sha256').update(allowedEndpoint(endpoint).toString()).digest('hex');
}

/** Standard single-record RFC 8291 aes128gcm encoding. Optional entropy is test-only. */
export function encryptWebPush(keys: WebPushSubscription['keys'], plaintext: Buffer, senderPrivate?: Buffer, salt = randomBytes(16)): Buffer {
  if (plaintext.length > 3993 || salt.length !== 16) throw new Error('invalid_push_record');
  const receiver = bytes(keys.p256dh, 65), auth = bytes(keys.auth, 16);
  const sender = createECDH('prime256v1');
  if (senderPrivate) sender.setPrivateKey(senderPrivate); else sender.generateKeys();
  const senderPublic = sender.getPublicKey();
  const shared = sender.computeSecret(receiver);
  const derive = (ikm: Buffer, s: Buffer, info: Buffer, size: number) => Buffer.from(hkdfSync('sha256', ikm, s, info, size));
  const ikm = derive(shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), receiver, senderPublic]), 32);
  const cek = derive(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = derive(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header);
  header.writeUInt32BE(4096, 16);
  header[20] = senderPublic.length;
  return Buffer.concat([header, senderPublic, ciphertext]);
}

function vapidKey(privateKey: string) {
  const scalar = bytes(privateKey, 32);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(scalar);
  const point = ecdh.getPublicKey();
  return { point, key: createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url'), d: scalar.toString('base64url') } }) };
}
export function vapidPublicKey(privateKey: string): string {
  return vapidKey(privateKey).point.toString('base64url');
}
export function vapidHeader(privateKey: string, endpoint: string, subject: string, now = Math.floor(Date.now() / 1000)): string {
  if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject) && !/^https:\/\/[^\s]+$/.test(subject)) throw new Error('invalid_vapid_subject');
  const aud = allowedEndpoint(endpoint).origin;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({ typ: 'JWT', alg: 'ES256' }) + '.' + encode({ aud, exp: now + 3600, sub: subject });
  const { point, key } = vapidKey(privateKey);
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return 'vapid t=' + unsigned + '.' + signature + ', k=' + point.toString('base64url');
}

export function sealSubscription(subscription: WebPushSubscription, storageKey: string, ownerId: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', bytes(storageKey, 32), nonce);
  cipher.setAAD(Buffer.from('fcr-push:v1:' + ownerId));
  const data = Buffer.concat([cipher.update(JSON.stringify(normalizePushSubscription(subscription)), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64url');
}
export function unsealSubscription(value: string, storageKey: string, ownerId: string): WebPushSubscription {
  if (typeof value !== 'string' || value.length > 5000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_ciphertext');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length < 29) throw new Error('invalid_ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', bytes(storageKey, 32), decoded.subarray(0, 12));
  decipher.setAAD(Buffer.from('fcr-push:v1:' + ownerId));
  decipher.setAuthTag(decoded.subarray(12, 28));
  const data = Buffer.concat([decipher.update(decoded.subarray(28)), decipher.final()]);
  return normalizePushSubscription(JSON.parse(data.toString('utf8')));
}

export async function sendWebPush(subscription: WebPushSubscription, payload: unknown, privateKey: string, subject: string, notificationKey: string): Promise<number> {
  const valid = normalizePushSubscription(subscription);
  const body = encryptWebPush(valid.keys, Buffer.from(JSON.stringify(payload)));
  const response = await fetch(valid.endpoint, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: vapidHeader(privateKey, valid.endpoint, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'normal',
      Topic: createHash('sha256').update(notificationKey).digest('base64url').slice(0, 32),
    },
    body: new Uint8Array(body),
  });
  // No provider response bodies or subscription URLs are logged.
  await response.body?.cancel().catch(() => undefined);
  return response.status;
}
