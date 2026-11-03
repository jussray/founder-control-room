import { describe, expect, it, vi } from 'vitest';
import {
  readScopedFileMetadata,
  WorkspaceMetadataAccessDenied,
  type WorkspaceGrant,
  type WorkspaceActor,
} from '../fileMetadata.js';

const FILE_ID = '1aBcDeFgHiJkLmNoPqRsTuVw';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const actor: WorkspaceActor = {
  userId: 'user-001',
  tenantId: 'tenant-001',
  googleAccountSubject: 'google-user-001',
};

const grant: WorkspaceGrant = {
  source: 'google-workspace-server-oauth',
  status: 'active',
  ownerUserId: 'user-001',
  tenantId: 'tenant-001',
  googleAccountSubject: 'google-user-001',
  permittedFileIds: [FILE_ID],
  scopes: [DRIVE_FILE_SCOPE],
  accessToken: 'server-held-token-not-for-logs',
  expiresAt: '2099-11-03T08:00:00.000Z',
};

function expectedFile() {
  return {
    id: FILE_ID,
    name: 'Private app notes',
    mimeType: 'application/vnd.google-apps.document',
    version: '7',
    modifiedTime: '2026-11-03T07:00:00.000Z',
    description: 'private string not returned',
    owners: [{ emailAddress: 'private@example.test' }],
  };
}

function fixture(overrides: Partial<WorkspaceGrant> = {}, person: WorkspaceActor = actor) {
  const getGrant = vi.fn(async () => ({ ...grant, ...overrides }));
  const fetchMetadata = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => expectedFile(),
  } as Response));
  return {
    input: { actor: person, fileId: FILE_ID, expectedMimeType: 'application/vnd.google-apps.document' },
    dependencies: { getGrant, fetchMetadata, now: () => Date.parse('2026-11-03T07:30:00.000Z') },
    getGrant,
    fetchMetadata,
  };
}

describe('per-user Google Workspace metadata read', () => {
  it('only reads the exact app-selected file with server-held user-bound Drive OAuth', async () => {
    const f = fixture();
    const result = await readScopedFileMetadata(f.input, f.dependencies);
    expect(f.getGrant).toHaveBeenCalledWith(actor, FILE_ID);
    expect(f.fetchMetadata).toHaveBeenCalledTimes(1);
    const [url, options] = f.fetchMetadata.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.googleapis.com/drive/v3/files/' + FILE_ID + '?fields=id%2Cname%2CmimeType%2Cversion%2CmodifiedTime');
    expect(options.method).toBe('GET');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer server-held-token-not-for-logs' });
    expect(result).toEqual({
      id: FILE_ID,
      name: 'Private app notes',
      mimeType: 'application/vnd.google-apps.document',
      version: '7',
      modifiedTime: '2026-11-03T07:00:00.000Z',
      nativeSkill: 'google-docs',
      source: 'LIVE_PROVIDER_RESPONSE',
      contentRead: false,
    });
    expect(JSON.stringify(result)).not.toContain('server-held-token');
    expect(JSON.stringify(result)).not.toContain('private@example.test');
  });

  it.each([
    [{ ownerUserId: 'other-user' }, 'different user'],
    [{ tenantId: 'other-tenant' }, 'different tenant'],
    [{ googleAccountSubject: 'other-google-account' }, 'different Google account'],
    [{ permittedFileIds: ['unrelated-file-01234567890'] }, 'file not chosen'],
    [{ source: 'chatgpt-connector' as WorkspaceGrant['source'] }, 'ChatGPT session'],
    [{ status: 'revoked' as WorkspaceGrant['status'] }, 'revoked grant'],
    [{ expiresAt: '2025-01-01T00:00:00.000Z' }, 'expired grant'],
    [{ scopes: ['https://www.googleapis.com/auth/userinfo.email'] }, 'sign-in-only token'],
    [{ scopes: ['https://www.googleapis.com/auth/drive'] }, 'unnecessarily broad scope'],
  ] as Array<[Partial<WorkspaceGrant>, string]>)('fails closed for %s (%s) before making Google requests', async (override: Partial<WorkspaceGrant>, _case: string) => {
    const f = fixture(override);
    await expect(readScopedFileMetadata(f.input, f.dependencies)).rejects.toBeInstanceOf(WorkspaceMetadataAccessDenied);
    expect(f.fetchMetadata).not.toHaveBeenCalled();
  });

  it('rejects malformed exact IDs and mismatched authenticated actor before grant lookup', async () => {
    const f = fixture();
    await expect(readScopedFileMetadata({ ...f.input, fileId: '../private' }, f.dependencies))
      .rejects.toBeInstanceOf(WorkspaceMetadataAccessDenied);
    await expect(readScopedFileMetadata({ ...f.input, actor: { ...actor, userId: '' } }, f.dependencies))
      .rejects.toBeInstanceOf(WorkspaceMetadataAccessDenied);
    expect(f.getGrant).not.toHaveBeenCalled();
    expect(f.fetchMetadata).not.toHaveBeenCalled();
  });

  it('rejects stale, cross-file, and mismatched-MIME responses without leaking their bodies', async () => {
    const f = fixture();
    f.fetchMetadata.mockImplementationOnce(async () => ({
      ok: true, status: 200, json: async () => ({ ...expectedFile(), id: 'other-file-abc12345' }),
    } as Response));
    await expect(readScopedFileMetadata(f.input, f.dependencies)).rejects.toBeInstanceOf(WorkspaceMetadataAccessDenied);
    f.fetchMetadata.mockImplementationOnce(async () => ({
      ok: true, status: 200, json: async () => ({ ...expectedFile(), mimeType: 'application/vnd.google-apps.spreadsheet' }),
    } as Response));
    await expect(readScopedFileMetadata(f.input, f.dependencies)).rejects.toBeInstanceOf(WorkspaceMetadataAccessDenied);
  });

  it('treats denied provider access as blocked source, not an empty-file success', async () => {
    const f = fixture();
    f.fetchMetadata.mockImplementationOnce(async () => ({
      ok: false, status: 403, json: async () => ({ error: 'raw provider secret never shown' }),
    } as Response));
    await expect(readScopedFileMetadata(f.input, f.dependencies)).rejects.toMatchObject({
      code: 'BLOCKED_SOURCE_ACCESS',
    });
  });

  it('does not call Google when the server grant cannot be resolved', async () => {
    const f = fixture();
    f.getGrant.mockRejectedValueOnce(new Error('private vault path and credentials'));
    await expect(readScopedFileMetadata(f.input, f.dependencies)).rejects.toMatchObject({
      code: 'BLOCKED_SOURCE_ACCESS',
    });
    expect(f.fetchMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ['application/vnd.google-apps.spreadsheet', 'google-sheets'],
    ['application/vnd.google-apps.presentation', 'google-slides'],
    ['application/pdf', 'google-drive'],
  ])('routes observed MIME %s to %s without reading content', async (mimeType, nativeSkill) => {
    const f = fixture();
    f.fetchMetadata.mockImplementationOnce(async () => ({
      ok: true, status: 200, json: async () => ({ ...expectedFile(), mimeType }),
    } as Response));
    const result = await readScopedFileMetadata({ ...f.input, expectedMimeType: mimeType }, f.dependencies);
    expect(result.nativeSkill).toBe(nativeSkill);
    expect(result.contentRead).toBe(false);
  });
});
