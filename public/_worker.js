const API_ORIGIN = 'https://api.foundercontrolroom.org';
const STATIC_METHODS = new Set(['GET', 'HEAD']);

function createApiRequest(request) {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, API_ORIGIN);
  const headers = new Headers(request.headers);

  headers.delete('host');
  headers.set('x-forwarded-host', sourceUrl.host);
  headers.set('x-forwarded-proto', sourceUrl.protocol.replace(':', ''));
  headers.set('x-founder-control-room-edge', 'cloudflare-pages');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (!STATIC_METHODS.has(request.method) && request.body !== null) {
    init.body = request.body;
  }

  return new Request(targetUrl, init);
}

export default {
  async fetch(request, env) {
    if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
      return new Response('Cloudflare Pages asset binding is unavailable.', { status: 500 });
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.origin === API_ORIGIN) {
      return new Response('Founder Control Room proxy loop blocked.', { status: 508 });
    }

    if (STATIC_METHODS.has(request.method)) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) return assetResponse;
    }

    return fetch(createApiRequest(request));
  },
};
