/**
 * On-demand, read-only Granola adapter. No automatic note ingestion, exports or writes.
 * Only a founder-approved folder is selectable; no account-wide scanning.
 */
export const GRANOLA_API_BASE = 'https://public-api.granola.ai';
const FOLDER_ID = /^fol_[A-Za-z0-9]{14}$/i;
const NOTE_ID = /^not_[A-Za-z0-9]{14}$/i;
const CURSOR = /^[A-Za-z0-9_+/=-]{1,2048}$/;
const MAX_RESPONSE_BYTES = 256_000;

export class GranolaReadError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'GranolaReadError';
  }
}

interface GranolaClientOptions {
  apiKey: string;
  allowedFolderId: string;
  fetchImpl?: typeof fetch;
}

export interface GranolaNoteMetadata {
  id: string;
  title: string | null;
  updatedAt: string | null;
}

export interface GranolaNoteSummary extends GranolaNoteMetadata {
  summary: string;
  evidenceState: 'PROVIDER_RETURNED_UNVERIFIED';
}

interface GranolaListResponse {
  notes: GranolaNoteMetadata[];
  hasMore: boolean;
  cursor: string | null;
}

function asObject(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
}

function metadata(input: unknown): GranolaNoteMetadata {
  const raw = asObject(input);
  if (!raw || typeof raw.id !== 'string' || !NOTE_ID.test(raw.id)) {
    throw new GranolaReadError('INVALID_PROVIDER_RESPONSE');
  }
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : null,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  };
}

async function jsonWithLimit(response: Response): Promise<unknown> {
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new GranolaReadError('PROVIDER_UNAVAILABLE');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new GranolaReadError('INVALID_PROVIDER_RESPONSE');
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new GranolaReadError('RESPONSE_TOO_LARGE');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new GranolaReadError('INVALID_PROVIDER_RESPONSE');
  }
}

export function createGranolaReadOnlyClient(options: GranolaClientOptions) {
  const apiKey = options.apiKey?.trim();
  const folderId = options.allowedFolderId?.trim();
  if (!apiKey || !folderId || !FOLDER_ID.test(folderId)) {
    throw new GranolaReadError('CONFIGURATION_REQUIRED');
  }
  const request = options.fetchImpl ?? fetch;

  async function get(path: string, query?: URLSearchParams): Promise<unknown> {
    const url = new URL(path, GRANOLA_API_BASE);
    if (query) url.search = query.toString();
    try {
      return await jsonWithLimit(await request(url, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      }));
    } catch (error) {
      if (error instanceof GranolaReadError) throw error;
      throw new GranolaReadError('PROVIDER_UNAVAILABLE');
    }
  }

  return {
    async listNotes({ cursor }: { cursor?: string } = {}): Promise<GranolaListResponse> {
      if (cursor !== undefined && !CURSOR.test(cursor)) {
        throw new GranolaReadError('INVALID_CURSOR');
      }
      const query = new URLSearchParams({ folder_id: folderId, page_size: '10' });
      if (cursor) query.set('cursor', cursor);
      const value = asObject(await get('/v1/notes', query));
      if (!value || !Array.isArray(value.notes) || typeof value.hasMore !== 'boolean') {
        throw new GranolaReadError('INVALID_PROVIDER_RESPONSE');
      }
      if (value.hasMore && (typeof value.cursor !== 'string' || !CURSOR.test(value.cursor))) {
        throw new GranolaReadError('INVALID_PROVIDER_RESPONSE');
      }
      return {
        notes: value.notes.map(metadata),
        hasMore: value.hasMore,
        cursor: value.hasMore ? value.cursor as string : null,
      };
    },

    async getSummary(noteId: string): Promise<GranolaNoteSummary> {
      if (!NOTE_ID.test(noteId)) throw new GranolaReadError('INVALID_NOTE_ID');
      const raw = asObject(await get('/v1/notes/' + noteId));
      if (!raw || raw.deleted_at !== null || !Array.isArray(raw.folder_membership)) {
        throw new GranolaReadError('NOTE_OUT_OF_SCOPE');
      }
      const isInFolder = raw.folder_membership.some((entry) => {
        const folder = asObject(entry);
        return typeof folder?.id === 'string' && folder.id.toLowerCase() === folderId.toLowerCase();
      });
      if (!isInFolder) throw new GranolaReadError('NOTE_OUT_OF_SCOPE');
      const note = metadata(raw);
      if (note.id.toLowerCase() !== noteId.toLowerCase()) {
        throw new GranolaReadError('INVALID_PROVIDER_RESPONSE');
      }
      if (typeof raw.summary_text !== 'string' || raw.summary_text.length > 16_000) {
        throw new GranolaReadError('INVALID_PROVIDER_RESPONSE');
      }
      return { ...note, summary: raw.summary_text, evidenceState: 'PROVIDER_RETURNED_UNVERIFIED' };
    },
  };
}
