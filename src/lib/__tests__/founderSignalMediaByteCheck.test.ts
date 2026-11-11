import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkFounderSignalMediaBytes } from '../founderSignalMediaByteCheck.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bRZsAAAAASUVORK5CYII=',
  'base64',
);
const mp4 = () => {
  // Synthetic MP4 *signature* fixture, NOT an actual playable or licensed video.
  const bytes = Buffer.alloc(40);
  bytes.writeUInt32BE(24, 0);
  bytes.write('ftyp', 4);
  bytes.write('isom', 8);
  return bytes;
};
async function* split(data: Uint8Array, size: number) {
  for (let i=0; i<data.length; i+=size) yield data.subarray(i, i+size);
}
const input = (data: Uint8Array, mime: 'image/png'|'image/jpeg'|'image/webp'|'video/mp4'='image/png') => ({
  declaredMimeType:mime, expectedSha256:sha(data),
});

describe('Founder Signal bounded local media-byte verification', () => {
  it('matches real PNG bytes across tiny chunks without turning local integrity into release authority', async () => {
    const result=await checkFounderSignalMediaBytes(split(png,1),input(png));
    expect(result.status).toBe('LOCAL_BYTES_HASH_AND_SIGNATURE_MATCH__UNTRUSTED_ORIGIN');
    expect(result.byteCount).toBe(png.length);
    expect(result.observedSha256).toBe(sha(png));
    expect(result.byteHashMatches).toBe(true);
    expect(result.headerAndTrailerMatch).toBe(true);
    expect(result.sourceAuthenticated).toBe(false);
    expect(result.privacyAndRightsVerified).toBe(false);
    expect(result.decodedMediaValidated).toBe(false);
    expect(result.authorizesDraft).toBe(false);
    expect(result.authorizesUpload).toBe(false);
    expect(result.authorizesPublication).toBe(false);
  });
  it('checks streamed synthetic MP4 signature but refuses to assert playable video', async () => {
    const bytes=mp4();
    const result=await checkFounderSignalMediaBytes(split(bytes,7),input(bytes,'video/mp4'));
    expect(result.status).toBe('LOCAL_BYTES_HASH_AND_SIGNATURE_MATCH__UNTRUSTED_ORIGIN');
    expect(result.decodedMediaValidated).toBe(false);
    expect(result.privacyAndRightsVerified).toBe(false);
  });
  it('rejects mislabeled media even with a matching byte digest', async () => {
    const result=await checkFounderSignalMediaBytes(split(png,10),input(png,'video/mp4'));
    expect(result.status).toBe('HOLD_UNVERIFIED');
    expect(result.byteHashMatches).toBe(true);
    expect(result.headerAndTrailerMatch).toBe(false);
    expect(result.reason).toBe('MEDIA_SIGNATURE_MISMATCH');
  });
  it('rejects a changed image even when the input claims the original SHA', async () => {
    const changed=Buffer.from(png);
    changed[25] ^= 1;
    const result=await checkFounderSignalMediaBytes(split(changed,20),input(png));
    expect(result.status).toBe('HOLD_UNVERIFIED');
    expect(result.reason).toBe('MEDIA_SHA256_MISMATCH');
    expect(result.byteHashMatches).toBe(false);
  });
  it('halts the reader at a configured size boundary', async () => {
    const result=await checkFounderSignalMediaBytes(split(png,10),{...input(png),maxBytes:20});
    expect(result.status).toBe('HOLD_UNVERIFIED');
    expect(result.reason).toBe('MEDIA_EXCEEDS_BYTE_BOUND');
    expect(result.byteCount).toBe(20);
  });
  it('rejects attempts to increase hard media byte ceilings', async () => {
    const result=await checkFounderSignalMediaBytes(split(png,10),{
      ...input(png),maxBytes:1_000_000_000,
    });
    expect(result.status).toBe('HOLD_UNVERIFIED');
    expect(result.reason).toBe('INVALID_MEDIA_CHECK_CONFIGURATION');
  });
  it('rejects empty chunks, empty streams and media reader failures', async () => {
    async function* empty() {}
    async function* invalid() { yield new Uint8Array(0); }
    async function* broken() { yield png; throw new Error('reader failed'); }
    for(const [iterator,reason] of [
      [empty(),'EMPTY_MEDIA_STREAM'],
      [invalid(),'INVALID_MEDIA_CHUNK'],
      [broken(),'MEDIA_READER_FAILED'],
    ] as const){
      const result=await checkFounderSignalMediaBytes(iterator,input(png));
      expect(result.status).toBe('HOLD_UNVERIFIED');
      expect(result.reason).toBe(reason);
    }
  });
  it('does not accept a malformed SHA or fake media type', async () => {
    const result=await checkFounderSignalMediaBytes(split(png,5),{...input(png),expectedSha256:'fake'});
    expect(result.status).toBe('HOLD_UNVERIFIED');
    expect(result.reason).toBe('INVALID_MEDIA_CHECK_CONFIGURATION');
    const fake=await checkFounderSignalMediaBytes(split(png,5),{
      declaredMimeType:'application/x-msdownload' as 'image/png',expectedSha256:sha(png),
    });
    expect(fake.status).toBe('HOLD_UNVERIFIED');
  });
  it('accepts synthetic JPEG marker boundaries but does not claim successful decode', async () => {
    const jpeg=Buffer.alloc(32);
    jpeg[0]=0xff;jpeg[1]=0xd8;jpeg[30]=0xff;jpeg[31]=0xd9;
    const result=await checkFounderSignalMediaBytes(split(jpeg,3),input(jpeg,'image/jpeg'));
    expect(result.status).toBe('LOCAL_BYTES_HASH_AND_SIGNATURE_MATCH__UNTRUSTED_ORIGIN');
    expect(result.decodedMediaValidated).toBe(false);
  });
  it('rejects malformed WEBP RIFF size even with valid SHA', async () => {
    const webp=Buffer.alloc(32);
    webp.write('RIFF',0);webp.writeUInt32LE(2,4);webp.write('WEBP',8);webp.write('VP8X',12);
    const result=await checkFounderSignalMediaBytes(split(webp,8),input(webp,'image/webp'));
    expect(result.status).toBe('HOLD_UNVERIFIED');
    expect(result.reason).toBe('MEDIA_SIGNATURE_MISMATCH');
  });
});
