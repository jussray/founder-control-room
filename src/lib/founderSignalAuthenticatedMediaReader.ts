import { createHash } from 'node:crypto';
import { checkFounderSignalMediaBytes, type FseMediaMime } from './founderSignalMediaByteCheck.js';
import type { AssetRegistryEntryV1 } from './mediaRouter.js';

/**
 * Dependency-injected authenticated asset reader boundary for FSE.
 *
 * Production must supply a SERVER-OWNED, principal-scoped adapter that
 * authorizes the registry record AND opens immutable/version-bound bytes.
 * Callers cannot pass a public URL, storage path, registry row, permission
 * receipt, or stream as evidence. Not wired into live storage or MCP.
 */
export const FSE_TRUSTED_MEDIA_READER_CONTRACT = 'fcr/fse-trusted-media-reader@v1' as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,119}$/;
const SHA = /^[a-fA-F0-9]{64}$/;
const MIME: Record<FseMediaMime, 'image' | 'video'> = {
  'image/png': 'image', 'image/jpeg': 'image',
  'image/webp': 'image', 'video/mp4': 'video',
};

export interface TrustedMediaReadRequest {
  // Principal and scopes MUST come from the authenticated server session.
  principalId: string;
  workspaceId: string;
  projectId: string;
  assetId: string;
  expectedSha256: string;
}

export interface AuthorizedMediaSnapshot {
  registry: AssetRegistryEntryV1;
  // Immutable storage-version identity returned by the trusted adapter.
  objectVersion: string;
  objectId: string;
  mediaMime: FseMediaMime;
  byteCount: number;
  sha256: string;
  // Adapter guarantees stream is bound to the returned objectId + version.
  bytes: AsyncIterable<Uint8Array>;
}

export interface AuthenticatedMediaReader {
  /**
   * Must perform server-side principal/tenant authorization and an immutable
   * version-bound read. Implementations MUST NOT trust caller storage URLs.
   * Must fail rather than return stale/weakly-authorized results.
   */
  openAuthorizedVersion(input: {
    principalId: string;
    workspaceId: string;
    projectId: string;
    assetId: string;
  }): Promise<AuthorizedMediaSnapshot | null>;
}

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function checkAuthorizedFounderSignalMedia(
  request: TrustedMediaReadRequest,
  reader: AuthenticatedMediaReader,
) {
  const base = {
    contract: FSE_TRUSTED_MEDIA_READER_CONTRACT,
    status: 'HOLD_UNVERIFIED' as 'HOLD_UNVERIFIED' | 'LOCAL_AUTHORIZED_READER_BYTE_MATCH__NOT_RELEASE_PROOF',
    reason: null as string | null,
    assetId: request.assetId,
    objectVersion: null as string | null,
    observedSha256: null as string | null,
    mediaByteCount: 0,
    readerAuthorizationAsserted: false,
    byteHashMatches: false,
    imageOrVideoDecoded: false,
    originIndependentlyAudited: false,
    licenseIndependentlyChecked: false,
    brandAndPrivacyReviewed: false,
    founderApproved: false,
    providerDraftObserved: false,
    handoffReady: false,
    authority: { canUpload: false, canDraft: false, canSchedule: false, canPublish: false },
    receiptFingerprint: null as string | null,
  };
  const hold = (reason: string) => ({...base, reason});
  if(!request || !reader || typeof reader.openAuthorizedVersion !== 'function') return hold('TRUSTED_READER_NOT_CONFIGURED');
  if (![request.principalId, request.workspaceId, request.projectId, request.assetId].every(
      x => typeof x === 'string' && ID.test(x)) || !SHA.test(request.expectedSha256)) {
    return hold('INVALID_SCOPED_ASSET_REQUEST');
  }
  let snap: AuthorizedMediaSnapshot | null;
  try {
    snap = await reader.openAuthorizedVersion({
      principalId: request.principalId,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      assetId: request.assetId,
    });
  } catch {
    return hold('AUTHORIZED_READER_ERROR');
  }
  if (!snap) return hold('ASSET_UNAVAILABLE_OR_UNAUTHORIZED');
  const row = snap.registry;
  if (!row || row.assetId !== request.assetId ||
    row.workspaceId !== request.workspaceId || row.projectId !== request.projectId ||
    row.status !== 'promoted' || !['image','video'].includes(row.kind) ||
    row.rights?.commercialUseStatus !== 'allowed' ||
    row.rights?.domainAuthorityGranted !== true ||
    !row.rights?.domainAuthorityRecordId ||
    !row.mediaExecutionReceiptId) {
    return hold('REGISTRY_SCOPE_STATUS_OR_RIGHTS_BLOCKED');
  }
  if(typeof snap.objectId !== 'string' || !ID.test(snap.objectId) ||
    typeof snap.objectVersion !== 'string' || !ID.test(snap.objectVersion) ||
    !(snap.mediaMime in MIME) || MIME[snap.mediaMime] !== row.kind ||
    !SHA.test(snap.sha256) ||
    snap.sha256.toLowerCase() !== request.expectedSha256.toLowerCase() ||
    !Number.isSafeInteger(snap.byteCount) || snap.byteCount < 1 ||
    !snap.bytes || typeof snap.bytes[Symbol.asyncIterator] !== 'function') {
    return hold('VERSION_BOUND_OBJECT_METADATA_MISMATCH');
  }
  // The stream callback must be atomically version-bound by the trusted reader.
  const measured = await checkFounderSignalMediaBytes(snap.bytes, {
    declaredMimeType: snap.mediaMime,
    expectedSha256: request.expectedSha256,
  });
  if (measured.status !== 'LOCAL_BYTES_HASH_AND_SIGNATURE_MATCH__UNTRUSTED_ORIGIN' ||
    measured.byteCount !== snap.byteCount) {
    return hold('VERSION_BOUND_BYTE_INTEGRITY_FAILED');
  }
  return {
    ...base,
    status: 'LOCAL_AUTHORIZED_READER_BYTE_MATCH__NOT_RELEASE_PROOF' as const,
    reason: null,
    objectVersion: snap.objectVersion,
    observedSha256: measured.observedSha256,
    mediaByteCount: measured.byteCount,
    readerAuthorizationAsserted: true,
    byteHashMatches: true,
    receiptFingerprint: fingerprint({
      assetId: request.assetId, projectId: request.projectId,
      workspaceId: request.workspaceId, objectId: snap.objectId,
      version: snap.objectVersion, sha256: measured.observedSha256,
      mediaExecutionReceiptId: row.mediaExecutionReceiptId,
      domainAuthorityRecordId: row.rights.domainAuthorityRecordId,
    }),
  };
}
