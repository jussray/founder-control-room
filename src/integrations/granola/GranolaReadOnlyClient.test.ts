import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGranolaReadOnlyClient, GranolaReadError } from './GranolaReadOnlyClient.js';
import { verifyGranolaWebhook } from './verifyWebhook.js';

const FOLDER = 'fol_4y6LduVdwSKC27';
const OTHER = 'fol_a74g2hvl98iUHG';
const NOTE_ID = 'not_1d3tmYTlCICgjy';
const fixture = {
  id: NOTE_ID,
  title: 'Product review',
  updated_at: '2026-11-07T12:00:00Z',
  folder_membership: [{ id: FOLDER }],
  summary_text: 'Decision pending.',
  private_notes_text: 'SECRET PRIVATE NOTE',
  transcript: [{ text: 'SECRET TRANSCRIPT' }],
  owner: { email: 'private@example.test' },
  deleted_at: null,
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});
const fake = (fn: (url: URL, init?: RequestInit) => Response | Promise<Response>) =>
  (async (url: string | URL | Request, init?: RequestInit) => fn(url as URL, init)) as typeof fetch;
const client = (fetchImpl: typeof fetch, overrides: Partial<{
  apiKey: string; allowedFolderId: string;
}> = {}) => createGranolaReadOnlyClient({
  apiKey: 'grn_test_placeholder',
  allowedFolderId: FOLDER,
  fetchImpl,
  ...overrides,
});

describe('Granola founder-only read boundary', () => {
  it('requires an explicit key and exact folder identifier before network access', () => {
    expect(() => client(fake(() => json({})), { apiKey: '' })).toThrow('CONFIGURATION_REQUIRED');
    expect(() => client(fake(() => json({})), { allowedFolderId: '../other' })).toThrow('CONFIGURATION_REQUIRED');
  });

  it('lists minimized metadata for the configured folder and never exposes private fields', async () => {
    const requests: string[] = [];
    const c = client(fake((url, init) => {
      requests.push(url.toString());
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer grn_test_placeholder');
      expect(init?.redirect).toBe('error');
      return json({ notes: [fixture], hasMore: false, cursor: null });
    }));
    const result = await c.listNotes();
    expect(requests).toEqual(['https://public-api.granola.ai/v1/notes?folder_id=' + FOLDER + '&page_size=10']);
    expect(result).toEqual({
      notes: [{ id: NOTE_ID, title: 'Product review', updatedAt: '2026-11-07T12:00:00Z' }],
      hasMore: false,
      cursor: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/SECRET|private@example|transcript/);
  });

  it('rejects note retrieval for another folder, a deleted note, or missing membership', async () => {
    await expect(client(fake(() => json({ ...fixture, folder_membership: [{ id: OTHER }] })))
      .getSummary(NOTE_ID)).rejects.toThrow('NOTE_OUT_OF_SCOPE');
    await expect(client(fake(() => json({ ...fixture, deleted_at: '2026-11-07T16:00:00Z' })))
      .getSummary(NOTE_ID)).rejects.toThrow('NOTE_OUT_OF_SCOPE');
    await expect(client(fake(() => json({ ...fixture, folder_membership: undefined })))
      .getSummary(NOTE_ID)).rejects.toThrow('NOTE_OUT_OF_SCOPE');
  });

  it('returns only summary and provenance state, not private notes or transcript', async () => {
    const result = await client(fake(() => json(fixture))).getSummary(NOTE_ID);
    expect(result).toEqual({
      id: NOTE_ID,
      title: 'Product review',
      updatedAt: '2026-11-07T12:00:00Z',
      summary: 'Decision pending.',
      evidenceState: 'PROVIDER_RETURNED_UNVERIFIED',
    });
    expect(JSON.stringify(result)).not.toMatch(/SECRET|private@example|transcript/);
  });

  it('rejects substituted note identity and unexpected cursor without network calls', async () => {
    await expect(client(fake(() => json({ ...fixture, id: 'not_2d3tmYTlCICgjy' })))
      .getSummary(NOTE_ID)).rejects.toThrow('INVALID_PROVIDER_RESPONSE');
    let called = false;
    const c = client(fake(() => { called = true; return json({}); }));
    await expect(c.getSummary('../invalid')).rejects.toThrow('INVALID_NOTE_ID');
    await expect(c.listNotes({ cursor: '\nAuthorization: evil' })).rejects.toThrow('INVALID_CURSOR');
    expect(called).toBe(false);
  });

  it('redacts provider errors and prevents oversized responses', async () => {
    const errorClient = client(fake(() => json({ error: 'SECRET grn_test_placeholder' }, 401)));
    await expect(errorClient.listNotes()).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    } satisfies Partial<GranolaReadError>);
    const largeClient = client(fake(() => json({ notes: [{ summary: 'x'.repeat(300_000) }] })));
    await expect(largeClient.listNotes()).rejects.toThrow('RESPONSE_TOO_LARGE');
  });

  it('only validates signed, fresh webhook metadata; does not ingest it', () => {
    const secret = 'whsec_' + Buffer.from('test signing key').toString('base64');
    const now = 1794078000000;
    const timestamp = String(Math.floor(now / 1000));
    const event = {
      event_id: '8f1c2a4e-6b3d-4e8f-9a2b-1c5d7e9f0a3b',
      event_type: 'note.generated',
      note_id: NOTE_ID,
      occurred_at: '2026-11-07T15:00:00Z',
    };
    const body = JSON.stringify(event);
    const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
      .update(event.event_id + '.' + timestamp + '.' + body).digest('base64');
    const headers = {
      'webhook-id': event.event_id,
      'webhook-timestamp': timestamp,
      'webhook-signature': 'v1,' + signature,
    };
    expect(verifyGranolaWebhook(headers, body, secret, now)).toEqual(event);
    expect(verifyGranolaWebhook({ ...headers, 'webhook-signature': 'v1,AAAA' }, body, secret, now)).toBeNull();
    expect(verifyGranolaWebhook(headers, body, secret, now + 600_000)).toBeNull();
    expect(verifyGranolaWebhook(headers, body.replace('note.generated', 'note.edited'), secret, now)).toBeNull();
  });
});
