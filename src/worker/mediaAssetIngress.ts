import type { ControlRoomWorkerEnv } from './handler.js';

/**
 * Serves generated post media (images/video) uploaded by
 * `src/lib/mediaContentGenerator.ts` at a stable HTTPS URL, from the
 * optional R2 binding declared in `wrangler.worker.toml`. Read-only: nothing
 * here writes to the bucket, grants publish authority, or proves a post
 * referencing this URL was ever founder-approved — it only makes a
 * previously-generated asset fetchable.
 *
 * The binding is optional on purpose: this route must 404/503 cleanly on a
 * Worker deployed before the R2 bucket itself is actually provisioned in
 * Cloudflare, rather than failing startup (`validateWorkerEnv`) or claiming
 * an asset exists when it does not.
 */
export const MEDIA_ASSET_INGRESS_PATH_PREFIX = '/media-assets/' as const;
const KEY_PATTERN = /^[0-9a-f-]{20,80}\.[a-z0-9]{1,8}$/i;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleMediaAssetIngress(
  request: Request,
  env: ControlRoomWorkerEnv,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' });
  }

  const bucket = env.MEDIA_ASSETS;
  if (!bucket) {
    return json(503, { error: 'media_assets_bucket_not_configured' });
  }

  const url = new URL(request.url);
  const key = url.pathname.slice(MEDIA_ASSET_INGRESS_PATH_PREFIX.length);
  if (!KEY_PATTERN.test(key)) {
    return json(400, { error: 'invalid_media_asset_key' });
  }

  const object = await bucket.get(key);
  if (!object) {
    return json(404, { error: 'media_asset_not_found' });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/octet-stream');

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}
