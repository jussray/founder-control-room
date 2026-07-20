import { describe, it, expect } from 'vitest';
import { GET } from '../route';

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('founder-control-room');
    expect(typeof body.timestamp).toBe('string');
  });

  it('sets Cache-Control: no-store', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
