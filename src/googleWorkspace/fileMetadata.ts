/**
 * Exact-file Google Workspace metadata adapter.
 *
 * This is NOT a public route or an OAuth grant store. The caller must supply
 * an authenticated server-side actor and resolve the grant from a user-scoped
 * secret vault. Never forward ChatGPT connector tokens or a Google sign-in
 * session to this adapter. No file listing, mutation, sharing or export occurs.
 */
export const GOOGLE_WORKSPACE_METADATA_CONTRACT = 'juss/google-workspace-exact-file@v1' as const;
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,256}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const IDENTITY_SCOPES = new Set([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]);
const REQUIRED_FIELDS = 'id,name,mimeType,version,modifiedTime';

export type WorkspaceActor = Readonly<{
  userId: string;
  tenantId: string;
  googleAccountSubject: string;
}>;

/** Must come from a trusted, user-scoped server secret store, never request JSON. */
export type WorkspaceGrant = Readonly<{
  source: 'google-workspace-server-oauth';
  status: 'active' | 'revoked';
  ownerUserId: string;
  tenantId: string;
  googleAccountSubject: string;
  permittedFileIds: readonly string[];
  scopes: readonly string[];
  accessToken: string;
  expiresAt: string;
}>;

export type WorkspaceNativeSkill = 'google-drive' | 'google-docs' | 'google-sheets' | 'google-slides';
export type WorkspaceFileMetadata = Readonly<{
  id: string;
  name: string;
  mimeType: string;
  version: string | null;
  modifiedTime: string | null;
  nativeSkill: WorkspaceNativeSkill;
  source: 'LIVE_PROVIDER_RESPONSE';
  contentRead: false;
}>;

export class WorkspaceMetadataAccessDenied extends Error {
  readonly code = 'BLOCKED_SOURCE_ACCESS';
  constructor() {
    super('Google Workspace source access is unavailable for this exact user and file.');
    this.name = 'WorkspaceMetadataAccessDenied';
  }
}

export interface WorkspaceMetadataDependencies {
  /** Must resolve against the authenticated actor and exact app-selected file. */
  getGrant(actor: WorkspaceActor, fileId: string): Promise<WorkspaceGrant | null>;
  fetchMetadata?: typeof fetch;
  now?: () => number;
}

function validSubject(value: unknown): value is string {
  return typeof value === 'string' && SUBJECT_PATTERN.test(value);
}

function checkedActor(actor: WorkspaceActor, fileId: string): void {
  if (!actor
    || !validSubject(actor.userId)
    || !validSubject(actor.tenantId)
    || !validSubject(actor.googleAccountSubject)
    || !FILE_ID_PATTERN.test(fileId)) {
    throw new WorkspaceMetadataAccessDenied();
  }
}

function authorizedGrant(grant: WorkspaceGrant | null, actor: WorkspaceActor, fileId: string, now: number): grant is WorkspaceGrant {
  if (!grant
    || grant.source !== 'google-workspace-server-oauth'
    || grant.status !== 'active'
    || grant.ownerUserId !== actor.userId
    || grant.tenantId !== actor.tenantId
    || grant.googleAccountSubject !== actor.googleAccountSubject
    || !Array.isArray(grant.permittedFileIds)
    || grant.permittedFileIds.length === 0
    || grant.permittedFileIds.length > 100
    || !grant.permittedFileIds.includes(fileId)
    || !Array.isArray(grant.scopes)
    || !grant.scopes.includes(DRIVE_FILE_SCOPE)
    || grant.scopes.some((scope) => scope !== DRIVE_FILE_SCOPE && !IDENTITY_SCOPES.has(scope))
    || typeof grant.accessToken !== 'string'
    || grant.accessToken.length < 10
    || grant.accessToken.length > 8192
    || /\s/.test(grant.accessToken)) {
    return false;
  }
  const expiry = Date.parse(grant.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

function nativeSkillFor(mimeType: string): WorkspaceNativeSkill {
  switch (mimeType) {
    case 'application/vnd.google-apps.document': return 'google-docs';
    case 'application/vnd.google-apps.spreadsheet': return 'google-sheets';
    case 'application/vnd.google-apps.presentation': return 'google-slides';
    default: return 'google-drive';
  }
}

function boundedName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return null;
  // Metadata is untrusted display data. Reject control characters and markup
  // rather than treating a filename as an agent command or HTML.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

function safeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return value.slice(0, 40);
}

export async function readScopedFileMetadata(
  input: Readonly<{
    actor: WorkspaceActor;
    fileId: string;
    expectedMimeType?: string;
  }>,
  dependencies: WorkspaceMetadataDependencies,
): Promise<WorkspaceFileMetadata> {
  if (!input || typeof input.fileId !== 'string') throw new WorkspaceMetadataAccessDenied();
  checkedActor(input.actor, input.fileId);
  // An expected MIME type is a caller assertion, never a provider substitute.
  if (input.expectedMimeType !== undefined
    && (typeof input.expectedMimeType !== 'string'
      || input.expectedMimeType.length > 150
      || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(input.expectedMimeType))) {
    throw new WorkspaceMetadataAccessDenied();
  }
  let grant: WorkspaceGrant | null;
  try {
    grant = await dependencies.getGrant(input.actor, input.fileId);
  } catch {
    // Do not include provider error messages, secret refs, file IDs, or token.
    throw new WorkspaceMetadataAccessDenied();
  }
  if (!authorizedGrant(grant, input.actor, input.fileId, (dependencies.now ?? Date.now)())) {
    throw new WorkspaceMetadataAccessDenied();
  }

  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?fields=${encodeURIComponent(REQUIRED_FIELDS)}`;
  try {
    const response = await (dependencies.fetchMetadata ?? fetch)(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${grant.accessToken}`,
        Accept: 'application/json',
      },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new WorkspaceMetadataAccessDenied();
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new WorkspaceMetadataAccessDenied();
    const row = data as Record<string, unknown>;
    const name = boundedName(row.name);
    if (row.id !== input.fileId || !name || typeof row.mimeType !== 'string'
      || row.mimeType.length > 150
      || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(row.mimeType)
      || (input.expectedMimeType && input.expectedMimeType !== row.mimeType)) {
      throw new WorkspaceMetadataAccessDenied();
    }
    return Object.freeze({
      id: input.fileId,
      name,
      mimeType: row.mimeType,
      version: typeof row.version === 'string' && /^\d+$/.test(row.version) ? row.version : null,
      modifiedTime: safeTimestamp(row.modifiedTime),
      nativeSkill: nativeSkillFor(row.mimeType),
      source: 'LIVE_PROVIDER_RESPONSE',
      contentRead: false,
    });
  } catch {
    // A provider 403/404/429, malformed response, network error or timeout is
    // BLOCKED_SOURCE_ACCESS. Never translate denial into an empty-file success.
    throw new WorkspaceMetadataAccessDenied();
  }
}
