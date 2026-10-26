import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  FFMPEG_RENDER_CONTRACT,
  FFMPEG_RENDER_EXECUTION_SCOPE,
  type FfmpegRenderResult,
} from './mediaFfmpegRender.js';
import { checkFounderSignalMediaBytes } from './founderSignalMediaByteCheck.js';

/**
 * Local process only. Bridges an existing FFmpeg render receipt to exact bytes
 * on an explicitly server-owned output root; it does not verify that the
 * receipt came from FFmpeg, decode media, or grant any publication authority.
 *
 * No remote fetch, upload, model inference, lifecycle/Buffer call, or
 * access to a user-supplied arbitrary filesystem location.
 */
export const FSE_FFMPEG_LOCAL_READBACK_CONTRACT = 'fcr/fse-ffmpeg-local-readback@v1' as const;
const SHA = /^[a-f0-9]{64}$/i;
const MAX_MP4_BYTES = 300 * 1024 * 1024;

export interface LocalRenderInspectionOptions {
  /** Trusted server configuration; NEVER map this from MCP arguments. */
  trustedOutputRoot: string;
}

export async function inspectFounderSignalLocalFfmpegRender(
  receipt: FfmpegRenderResult,
  options: LocalRenderInspectionOptions,
) {
  const base = {
    contract: FSE_FFMPEG_LOCAL_READBACK_CONTRACT,
    status: 'HOLD_UNVERIFIED' as
      | 'HOLD_UNVERIFIED'
      | 'LOCAL_FFMPEG_RECEIPT_BYTE_MATCH__NOT_RELEASE_PROOF',
    reason: null as string | null,
    observedSha256: null as string | null,
    bytesObserved: 0,
    byteHashMatches: false,
    fileOriginAuthenticated: false,
    rendererProvenanceAuthenticated: false,
    decodedVideoValidated: false,
    rightsVerified: false,
    audienceClaimVerified: false,
    founderApproved: false,
    providerReadbackObserved: false,
    grantsDraftAuthority: false,
    grantsPublicationAuthority: false,
  };
  const hold = (reason: string) => ({ ...base, reason });
  if (!receipt || receipt.kind !== 'RENDERED' ||
    receipt.contract !== FFMPEG_RENDER_CONTRACT ||
    receipt.executionScope !== FFMPEG_RENDER_EXECUTION_SCOPE ||
    typeof receipt.outputPath !== 'string' ||
    !isAbsolute(receipt.outputPath) ||
    !receipt.outputPath.endsWith('.mp4') ||
    typeof receipt.sha256 !== 'string' || !SHA.test(receipt.sha256) ||
    !Number.isSafeInteger(receipt.bytes) ||
    receipt.bytes <= 0 || receipt.bytes > MAX_MP4_BYTES ||
    receipt.publishAuthority !== false || receipt.truthAuthority !== false) {
    return hold('RENDER_RECEIPT_NOT_ACCEPTABLE');
  }
  const root = options?.trustedOutputRoot;
  if (typeof root !== 'string' || !isAbsolute(root)) {
    return hold('TRUSTED_RENDER_ROOT_MISSING');
  }
  let file: Awaited<ReturnType<typeof open>> | null = null;
  try {
    const rootPath = await realpath(root);
    const target = resolve(receipt.outputPath);
    const relation = relative(rootPath, target);
    if (!relation || relation.startsWith('..' + sep) || relation === '..' ||
      isAbsolute(relation) || relation.includes('..' + sep)) {
      return hold('RENDER_PATH_OUTSIDE_TRUSTED_ROOT');
    }
    // Reject symlinked paths including any symlinked parent directory.
    const actual = await realpath(target);
    if (actual !== target) return hold('RENDER_PATH_SYMLINK_OR_ALIAS');
    const meta = await lstat(target);
    if (!meta.isFile() || meta.isSymbolicLink() || meta.size !== receipt.bytes) {
      return hold('RENDER_FILE_NOT_REGULAR_OR_SIZE_MISMATCH');
    }
    file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const pinnedBefore = await file.stat();
    if (!pinnedBefore.isFile() || pinnedBefore.size !== receipt.bytes ||
      pinnedBefore.dev !== meta.dev || pinnedBefore.ino !== meta.ino) {
      return hold('RENDER_FILE_CHANGED_BEFORE_READ');
    }
    const measured = await checkFounderSignalMediaBytes(
      file.createReadStream({ autoClose: false }),
      { declaredMimeType: 'video/mp4', expectedSha256: receipt.sha256 },
    );
    const pinnedAfter = await file.stat();
    const current = await lstat(target);
    if (pinnedAfter.size !== pinnedBefore.size ||
      pinnedAfter.mtimeMs !== pinnedBefore.mtimeMs ||
      current.dev !== pinnedBefore.dev || current.ino !== pinnedBefore.ino) {
      return hold('RENDER_FILE_CHANGED_DURING_READ');
    }
    if (measured.status !== 'LOCAL_BYTES_HASH_AND_SIGNATURE_MATCH__UNTRUSTED_ORIGIN' ||
      measured.byteCount !== receipt.bytes) {
      return hold('RENDER_BYTES_OR_CONTAINER_MISMATCH');
    }
    return {
      ...base,
      status: 'LOCAL_FFMPEG_RECEIPT_BYTE_MATCH__NOT_RELEASE_PROOF' as const,
      observedSha256: measured.observedSha256,
      bytesObserved: measured.byteCount,
      byteHashMatches: true,
      warning: 'A local file matched the provided FFmpeg receipt hash and shallow MP4 signature. Receipt provenance, playable decode, rights, brand/privacy, and founder publication authorization remain unverified.',
    };
  } catch {
    return hold('LOCAL_RENDER_READBACK_FAILED');
  } finally {
    if (file) await file.close().catch(() => undefined);
  }
}
