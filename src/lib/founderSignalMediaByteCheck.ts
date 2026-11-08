import { createHash } from 'node:crypto';

/**
 * Offline byte-integrity check for streams supplied by a separately trusted
 * asset reader. NOT an HTTP fetcher, media decoder, license check, content
 * safety gate, authenticated provider receipt or publication authorization.
 */
export const FSE_MEDIA_BYTE_CHECK_CONTRACT = 'fcr/fse-media-byte-integrity@v1' as const;

export type FseMediaMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';
const MIME_TYPE: Readonly<Record<FseMediaMime, 'image' | 'video'>> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
};
const HEX64 = /^[a-f0-9]{64}$/i;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const PREFIX = 24;
const SUFFIX = 16;

export interface FseMediaByteCheckInput {
  declaredMimeType: FseMediaMime;
  expectedSha256: string;
  maxBytes?: number;
}

function magicMatches(mime: FseMediaMime, start: Uint8Array, end: Uint8Array, count: number): boolean {
  if (mime === 'image/png') {
    // PNG signature and trailing IEND chunk. A decoder still must validate the
    // complete PNG, including chunk lengths/CRCs and pixel content.
    const signature = [137,80,78,71,13,10,26,10];
    const iend = [0,0,0,0,73,69,78,68,174,66,96,130];
    return count >= 45 && signature.every((n,i) => start[i] === n) &&
      iend.every((n,i) => end[end.length - iend.length + i] === n);
  }
  if (mime === 'image/jpeg') {
    return count >= 20 && start[0] === 0xff && start[1] === 0xd8 &&
      end[end.length - 2] === 0xff && end[end.length - 1] === 0xd9;
  }
  if (mime === 'image/webp') {
    const text = (offset: number, length: number) =>
      String.fromCharCode(...start.subarray(offset, offset + length));
    const subtype = text(12, 4);
    const fileSize = start[4] + start[5] * 256 + start[6] * 65536 + start[7] * 16777216;
    return count >= 20 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(subtype) &&
      fileSize === count - 8;
  }
  if (mime === 'video/mp4') {
    const marker = String.fromCharCode(...start.subarray(4, 8));
    const brand = String.fromCharCode(...start.subarray(8, 12));
    const boxLength = start[0] * 2**24 + start[1] * 65536 + start[2] * 256 + start[3];
    return count >= 32 && marker === 'ftyp' &&
      boxLength >= 16 && boxLength <= count &&
      ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV'].includes(brand);
  }
  return false;
}

export async function checkFounderSignalMediaBytes(
  stream: AsyncIterable<Uint8Array>,
  input: FseMediaByteCheckInput,
) {
  const mime = input.declaredMimeType;
  const kind = MIME_TYPE[mime];
  const expected = input.expectedSha256?.toLowerCase();
  const hardMax = kind === 'image' ? MAX_IMAGE_BYTES : kind === 'video' ? MAX_VIDEO_BYTES : 0;
  const limit = input.maxBytes === undefined ? hardMax : input.maxBytes;
  const base = {
    contract: FSE_MEDIA_BYTE_CHECK_CONTRACT,
    declaredMimeType: mime,
    expectedSha256: HEX64.test(expected ?? '') ? expected : null,
    byteCount: 0,
    observedSha256: null as string | null,
    byteHashMatches: false,
    headerAndTrailerMatch: false,
    sourceAuthenticated: false,
    decodedMediaValidated: false,
    contentReviewed: false,
    privacyAndRightsVerified: false,
    providerReadbackVerified: false,
    founderApprovalVerified: false,
    authorizesDraft: false,
    authorizesUpload: false,
    authorizesPublication: false,
  };
  const hold = (reason: string, bytes = 0, observed: string | null = null) => ({
    ...base, status: 'HOLD_UNVERIFIED' as const, reason,
    byteCount: bytes, observedSha256: observed,
  });
  if (!kind || !HEX64.test(expected ?? '') ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > hardMax) {
    return hold('INVALID_MEDIA_CHECK_CONFIGURATION');
  }
  const hasher = createHash('sha256');
  let count = 0;
  let head = new Uint8Array(0);
  let tail = new Uint8Array(0);
  try {
    for await (const chunk of stream) {
      if (!(chunk instanceof Uint8Array) || chunk.length === 0) return hold('INVALID_MEDIA_CHUNK', count);
      if (chunk.length > limit - count) return hold('MEDIA_EXCEEDS_BYTE_BOUND', count);
      hasher.update(chunk);
      count += chunk.length;
      if (head.length < PREFIX) {
        const take = Math.min(PREFIX - head.length, chunk.length);
        const expanded = new Uint8Array(head.length + take);
        expanded.set(head, 0);
        expanded.set(chunk.subarray(0, take), head.length);
        head = expanded;
      }
      const expandedTail = new Uint8Array(Math.min(SUFFIX, tail.length + chunk.length));
      const earlier = Math.max(0, SUFFIX - chunk.length);
      if (earlier) expandedTail.set(tail.subarray(Math.max(0, tail.length - earlier)), 0);
      expandedTail.set(chunk.subarray(Math.max(0, chunk.length - expandedTail.length)),
        expandedTail.length - Math.min(expandedTail.length, chunk.length));
      tail = expandedTail;
    }
  } catch {
    return hold('MEDIA_READER_FAILED', count);
  }
  if (!count) return hold('EMPTY_MEDIA_STREAM');
  const observed = hasher.digest('hex');
  const magic = magicMatches(mime, head, tail, count);
  const hashMatch = observed === expected;
  if (!hashMatch || !magic) {
    return {
      ...hold(!hashMatch ? 'MEDIA_SHA256_MISMATCH' : 'MEDIA_SIGNATURE_MISMATCH', count, observed),
      byteHashMatches: hashMatch,
      headerAndTrailerMatch: magic,
    };
  }
  return {
    ...base,
    status: 'LOCAL_BYTES_HASH_AND_SIGNATURE_MATCH__UNTRUSTED_ORIGIN' as const,
    reason: null,
    byteCount: count,
    observedSha256: observed,
    byteHashMatches: true,
    headerAndTrailerMatch: true,
    warning: 'Only in-memory bytes, digest and basic container signatures were checked. Origin, license, decoding, visual truth, safety, approval and provider state remain unverified.',
  };
}
