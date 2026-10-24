const EVENTS = new Set(['call_click','whatsapp_click','pickup_request','directions_click']);

const PAPPA = {
  project: 'pappa-razzy-laundry',
  call: 'tel:+2349135081096',
  whatsapp: 'https://wa.me/2349135081096',
  pickup: 'https://wa.me/2349135081096?text=Hello%20Pappa%20Razzy%2C%20I%27d%20like%20to%20request%20a%20laundry%20pickup.',
  directions: 'https://www.google.com/maps/search/?api=1&query=No.%202%20Temidire%20Street%2C%20Off%20Old%20Jebba%20Road%2C%20Beside%20School%20for%20Special%20Needs%2C%20Ilorin%2C%20Kwara%20State%2C%20Nigeria',
};

function allowedOrigin(origin) {
  if (!origin) return false;
  if (origin === 'https://pappa-razzy-laundry.p9s5nbwqyt.chatgpt.site') return true;
  if (origin === 'https://jussco.company' || origin === 'https://www.jussco.company') return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.jussco.company');
  } catch {
    return false;
  }
}

function cors(origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
  if (allowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST,OPTIONS';
    headers['access-control-allow-headers'] = 'content-type';
    headers['access-control-max-age'] = '86400';
  }
  return headers;
}

function clean(value, max, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, max);
}

async function record(env, data) {
  const project = clean(data.project, 64);
  const eventName = clean(data.event_name, 40);
  if (!/^[a-z0-9-]{1,64}$/.test(project) || !EVENTS.has(eventName)) {
    throw new Error('invalid_event');
  }

  const pagePath = clean(data.page_path, 256, '/');
  const ctaLocation = clean(data.cta_location, 64, 'unknown');
  const serviceContext = clean(data.service_context, 64, '') || null;
  let occurredAt = clean(data.occurred_at, 40, '') || null;
  if (occurredAt && Number.isNaN(Date.parse(occurredAt))) occurredAt = null;

  await env.DB
    .prepare(
      'INSERT INTO conversion_events (project,event_name,page_path,cta_location,service_context,occurred_at) VALUES (?,?,?,?,?,?)',
    )
    .bind(project, eventName, pagePath, ctaLocation, serviceContext, occurredAt)
    .run();
}

async function redirectTracked(request, env, eventName, destination, defaultCta) {
  const url = new URL(request.url);
  const cta = clean(url.searchParams.get('cta'), 64, defaultCta) || defaultCta;

  await record(env, {
    project: PAPPA.project,
    event_name: eventName,
    page_path: '/',
    cta_location: cta,
    service_context: 'laundry',
  });

  return Response.redirect(destination, 302);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'GET' && url.pathname === '/health') {
      const probe = await env.DB.prepare('SELECT 1 AS ok').first();
      return new Response(
        JSON.stringify({
          ok: probe?.ok === 1,
          service: 'jussco-conversions',
          events: [...EVENTS],
          storage: 'd1',
        }),
        {
          status: probe?.ok === 1 ? 200 : 503,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        },
      );
    }

    if (request.method === 'GET' && url.pathname === '/pappa/call') {
      return redirectTracked(request, env, 'call_click', PAPPA.call, 'primary_call');
    }
    if (request.method === 'GET' && url.pathname === '/pappa/whatsapp') {
      return redirectTracked(request, env, 'whatsapp_click', PAPPA.whatsapp, 'primary_whatsapp');
    }
    if (request.method === 'GET' && url.pathname === '/pappa/pickup') {
      return redirectTracked(request, env, 'pickup_request', PAPPA.pickup, 'pickup_cta');
    }
    if (request.method === 'GET' && url.pathname === '/pappa/directions') {
      return redirectTracked(request, env, 'directions_click', PAPPA.directions, 'find_us');
    }

    if (request.method === 'OPTIONS' && url.pathname === '/v1/event') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method === 'POST' && url.pathname === '/v1/event') {
      if (!allowedOrigin(origin)) {
        return new Response(JSON.stringify({ ok: false, error: 'origin_not_allowed' }), {
          status: 403,
          headers: cors(origin),
        });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
          status: 400,
          headers: cors(origin),
        });
      }

      try {
        await record(env, body);
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid_event' }), {
          status: 400,
          headers: cors(origin),
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: cors(origin),
      });
    }

    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    });
  },
};
