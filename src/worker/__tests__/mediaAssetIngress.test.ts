import { describe, expect, it, vi } from 'vitest';
import type { ControlRoomWorkerEnv } from '../handler.js';
import { MEDIA_ASSET_INGRESS_PATH_PREFIX, handleMediaAssetIngress } from '../mediaAssetIngress.js';

const VALID_KEY = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.png';

function envWithBucket(get: ReturnType<typeof vi.fn>): Partial<ControlRoomWorkerEnv> {
  return { MEDIA_ASSETS: { get } as unknown as ControlRoomWorkerEnv['MEDIA_ASSETS'] };
}

describe('handleMediaAssetIngress', () => {
  it('returns 503 when the bucket binding is not configured', async () => {
    const request = new Request(`https://api.example.com${MEDIA_ASSET_INGRESS_PATH_PREFIX}${VALID_KEY}`);
    const response = await handleMediaAssetIngress(request, {} as ControlRoomWorkerEnv);
    expect(response.status).toBe(503);
  });

  it('rejects a non-GET/HEAD method', async () => {
    const request = new Request(`https://api.example.com${MEDIA_ASSET_INGRESS_PATH_PREFIX}${VALID_KEY}`, { method: 'POST' });
    const response = await handleMediaAssetIngress(request, envWithBucket(vi.fn()) as ControlRoomWorkerEnv);
    expect(response.status).toBe(405);
  });

  it('rejects a key that does not match the generated-asset key pattern', async () => {
    const get = vi.fn();
    const request = new Request(`https://api.example.com${MEDIA_ASSET_INGRESS_PATH_PREFIX}../../etc/passwd`);
    const response = await handleMediaAssetIngress(request, envWithBucket(get) as ControlRoomWorkerEnv);
    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('returns 404 when the bucket has no object for the key', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const request = new Request(`https://api.example.com${MEDIA_ASSET_INGRESS_PATH_PREFIX}${VALID_KEY}`);
    const response = await handleMediaAssetIngress(request, envWithBucket(get) as ControlRoomWorkerEnv);
    expect(response.status).toBe(404);
    expect(get).toHaveBeenCalledWith(VALID_KEY);
  });

  it('streams the object body with its content type on a GET', async () => {
    const writeHttpMetadata = vi.fn((headers: Headers) => headers.set('Content-Type', 'image/png'));
    const get = vi.fn().mockResolvedValue({ body: new Uint8Array([1, 2, 3]), writeHttpMetadata });
    const request = new Request(`https://api.example.com${MEDIA_ASSET_INGRESS_PATH_PREFIX}${VALID_KEY}`);
    const response = await handleMediaAssetIngress(request, envWithBucket(get) as ControlRoomWorkerEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toContain('immutable');
  });

  it('returns no body on a HEAD request', async () => {
    const writeHttpMetadata = vi.fn((headers: Headers) => headers.set('Content-Type', 'image/png'));
    const get = vi.fn().mockResolvedValue({ body: new Uint8Array([1, 2, 3]), writeHttpMetadata });
    const request = new Request(`https://api.example.com${MEDIA_ASSET_INGRESS_PATH_PREFIX}${VALID_KEY}`, { method: 'HEAD' });
    const response = await handleMediaAssetIngress(request, envWithBucket(get) as ControlRoomWorkerEnv);
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });
});
