const API_ORIGIN = 'https://api.foundercontrolroom.org';
const API_SERVICE_HEADER = 'x-founder-control-room-service';
const EXPECTED_API_SERVICE = 'founder-control-room';
const RETRY_AFTER_SECONDS = '120';
const STATIC_METHODS = new Set(['GET', 'HEAD']);
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const NON_RETRYABLE_GET_PATHS = new Set(['/auth/callback']);
const STATIC_FILE_PATTERN = /\.(?:avif|css|gif|html|ico|jpe?g|js|map|png|svg|txt|webmanifest|webp|woff2?|xml)$/i;
const STATIC_DIRECTORY_PREFIXES = [
  '/control-room',
  '/portable-founder-console',
  '/juss-rayy',
];
const CLOUDFLARE_UPSTREAM_FAILURES = new Set([520, 521, 522, 523, 524, 525, 526, 527, 530]);

function shouldServeFromPages(request) {
  if (!STATIC_METHODS.has(request.method)) return false;

  const { pathname } = new URL(request.url);
  return pathname === '/'
    || STATIC_DIRECTORY_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
    || STATIC_FILE_PATTERN.test(pathname);
}

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

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function requestPath(request) {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`.slice(0, 2048);
}

function wantsHtml(request) {
  return request.method === 'GET'
    && (request.headers.get('accept') ?? '').toLowerCase().includes('text/html');
}

function retryPolicy(request) {
  const { pathname } = new URL(request.url);
  const safeToRetry = RETRYABLE_METHODS.has(request.method)
    && !NON_RETRYABLE_GET_PATHS.has(pathname);

  return {
    safeToRetry,
    retryAfterSeconds: safeToRetry ? Number(RETRY_AFTER_SECONDS) : null,
  };
}

function degradedResponse(request, code) {
  const retry = retryPolicy(request);
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Founder-Control-Room-Degraded': code,
    'X-Robots-Tag': 'noindex, nofollow',
  });

  if (retry.safeToRetry) {
    headers.set('Retry-After', RETRY_AFTER_SECONDS);
  }

  if (!wantsHtml(request)) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
    const body = request.method === 'HEAD'
      ? null
      : JSON.stringify({
        ok: false,
        error: 'Founder Control Room is temporarily unavailable.',
        code,
        requestOutcome: 'unknown',
        safeToRetry: retry.safeToRetry,
        retryAfterSeconds: retry.retryAfterSeconds,
      });
    return new Response(body, { status: 503, headers });
  }

  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );

  const retryPath = escapeHtml(requestPath(request));
  const statusText = retry.safeToRetry
    ? 'This read-only request can be tried again after the service reconnects.'
    : 'Check the control room before repeating this request. Retrying could duplicate an action or reuse a one-time link.';
  const retryAction = retry.safeToRetry
    ? `<a class="primary" href="${retryPath}">Try again</a>`
    : '';
  const controlRoomClass = retry.safeToRetry ? 'secondary' : 'primary';
  const controlRoomLabel = retry.safeToRetry ? 'Return to control room' : 'Check control room';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Founder Control Room temporarily unavailable</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top, #221847 0, #0c1020 48%, #070910 100%); color: #f7f5ff; }
    main { width: min(100%, 680px); border: 1px solid rgba(188, 168, 255, .32); border-radius: 24px; padding: clamp(28px, 7vw, 52px); background: rgba(15, 17, 35, .92); box-shadow: 0 28px 90px rgba(0, 0, 0, .45); }
    .eyebrow { margin: 0 0 12px; color: #c5b7ff; font-size: .78rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; max-width: 16ch; font-size: clamp(2rem, 7vw, 3.5rem); line-height: 1.02; letter-spacing: -.04em; }
    p { margin: 22px 0 0; max-width: 58ch; color: #d9d4ec; font-size: 1.02rem; line-height: 1.65; }
    .status { margin-top: 28px; padding: 14px 16px; border-left: 4px solid #a78bfa; border-radius: 10px; background: rgba(124, 92, 255, .12); }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
    a { display: inline-flex; min-height: 46px; align-items: center; justify-content: center; border-radius: 999px; padding: 0 20px; font-weight: 800; text-decoration: none; }
    a:focus-visible { outline: 3px solid #f1e9ff; outline-offset: 4px; }
    .primary { background: #bca7ff; color: #130f24; }
    .secondary { border: 1px solid rgba(237, 231, 255, .4); color: #f7f5ff; }
    .detail { margin-top: 26px; color: #aaa2c4; font-size: .85rem; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Founder Control Room</p>
    <section role="alert" aria-live="assertive">
      <h1>Temporarily unavailable</h1>
      <p>The control room could not verify its API service, so it cannot confirm whether this request completed.</p>
      <p class="status">${statusText}</p>
    </section>
    <nav class="actions" aria-label="Recovery actions">
      ${retryAction}
      <a class="${controlRoomClass}" href="/">${controlRoomLabel}</a>
    </nav>
    <p class="detail">Request outcome: unknown · Recovery code: ${escapeHtml(code)}</p>
  </main>
</body>
</html>`;

  return new Response(html, { status: 503, headers });
}

function upstreamFailureCode(response) {
  if (CLOUDFLARE_UPSTREAM_FAILURES.has(response.status)) return 'API_UPSTREAM_52X';
  if (response.headers.get(API_SERVICE_HEADER) !== EXPECTED_API_SERVICE) {
    return 'API_SERVICE_IDENTITY_MISMATCH';
  }
  return null;
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

    if (shouldServeFromPages(request)) {
      return env.ASSETS.fetch(request);
    }

    if (!env?.FCR_API || typeof env.FCR_API.fetch !== 'function') {
      return degradedResponse(request, 'API_SERVICE_BINDING_UNAVAILABLE');
    }

    try {
      const response = await env.FCR_API.fetch(createApiRequest(request));
      const failureCode = upstreamFailureCode(response);
      return failureCode ? degradedResponse(request, failureCode) : response;
    } catch {
      return degradedResponse(request, 'API_UPSTREAM_UNREACHABLE');
    }
  },
};
