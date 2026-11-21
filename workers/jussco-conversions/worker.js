const EVENTS = new Set(['call_click','whatsapp_click','pickup_request','directions_click']);

const PAPPA = {
  project: 'pappa-razzy-laundry',
  call: 'tel:+2349135081096',
  whatsapp: 'https://wa.me/2349135081096',
  pickup: 'https://wa.me/2349135081096?text=Hello%20Pappa%20Razzy%2C%20I%27d%20like%20to%20request%20a%20laundry%20pickup.',
  directions: 'https://www.google.com/maps/search/?api=1&query=No.%202%20Temidire%20Street%2C%20Off%20Old%20Jebba%20Road%2C%20Beside%20School%20for%20Special%20Needs%2C%20Ilorin%2C%20Kwara%20State%2C%20Nigeria',
};

const PROJECTS = {
  [PAPPA.project]: {
    origins: new Set(['https://pappa-razzy-laundry.p9s5nbwqyt.chatgpt.site']),
    serviceContext: 'laundry',
    pagePaths: new Set(['/', '/contact', '/services', '/pickup', '/directions']),
    ctaByEvent: {
      call_click: 'primary_call',
      whatsapp_click: 'primary_whatsapp',
      pickup_request: 'pickup_cta',
      directions_click: 'find_us',
    },
  },
};

function clean(value, max, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, max);
}

function knownOrigin(origin) {
  if (!origin) return false;
  return Object.values(PROJECTS).some(project => project.origins.has(origin));
}

function allowedOrigin(origin, project) {
  return Boolean(origin && PROJECTS[project]?.origins.has(origin));
}

function cors(origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
  if (knownOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST,OPTIONS';
    headers['access-control-allow-headers'] = 'content-type';
    headers['access-control-max-age'] = '86400';
  }
  return headers;
}

function invalidEvent() {
  throw new Error('invalid_event');
}

function normalizePagePath(value, allowedPaths) {
  const raw = clean(value, 512, '/');
  if (!raw.startsWith('/') || raw.startsWith('//')) invalidEvent();

  let pathname;
  try {
    pathname = new URL(raw, 'https://event.invalid').pathname;
  } catch {
    invalidEvent();
  }

  if (!allowedPaths.has(pathname)) invalidEvent();
  return pathname;
}

function normalizeEventData(data) {
  const project = clean(data?.project, 64);
  const eventName = clean(data?.event_name, 40);
  const policy = PROJECTS[project];

  if (!policy || !EVENTS.has(eventName)) invalidEvent();

  const pagePath = normalizePagePath(data?.page_path, policy.pagePaths);
  const ctaLocation = policy.ctaByEvent[eventName];
  if (!ctaLocation) invalidEvent();

  if (data?.cta_location !== undefined && clean(data.cta_location, 64) !== ctaLocation) {
    invalidEvent();
  }
  if (data?.service_context !== undefined && clean(data.service_context, 64) !== policy.serviceContext) {
    invalidEvent();
  }

  let occurredAt = clean(data?.occurred_at, 40, '') || null;
  if (occurredAt) {
    const parsed = Date.parse(occurredAt);
    occurredAt = Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  return {
    project,
    eventName,
    pagePath,
    ctaLocation,
    serviceContext: policy.serviceContext,
    occurredAt,
  };
}

async function record(env, data) {
  const event = normalizeEventData(data);
  await env.DB
    .prepare(
      'INSERT INTO conversion_events (project,event_name,page_path,cta_location,service_context,occurred_at) VALUES (?,?,?,?,?,?)',
    )
    .bind(
      event.project,
      event.eventName,
      event.pagePath,
      event.ctaLocation,
      event.serviceContext,
      event.occurredAt,
    )
    .run();
}

async function redirectTracked(env, eventName, destination, ctaLocation) {
  try {
    await record(env, {
      project: PAPPA.project,
      event_name: eventName,
      page_path: '/',
      cta_location: ctaLocation,
      service_context: 'laundry',
    });
  } catch {
    // Analytics must never block the underlying customer business action.
  }

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
      return redirectTracked(env, 'call_click', PAPPA.call, 'primary_call');
    }
    if (request.method === 'GET' && url.pathname === '/pappa/whatsapp') {
      return redirectTracked(env, 'whatsapp_click', PAPPA.whatsapp, 'primary_whatsapp');
    }
    if (request.method === 'GET' && url.pathname === '/pappa/pickup') {
      return redirectTracked(env, 'pickup_request', PAPPA.pickup, 'pickup_cta');
    }
    if (request.method === 'GET' && url.pathname === '/pappa/directions') {
      return redirectTracked(env, 'directions_click', PAPPA.directions, 'find_us');
    }

    if (request.method === 'OPTIONS' && url.pathname === '/v1/event') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method === 'POST' && url.pathname === '/v1/event') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
          status: 400,
          headers: cors(origin),
        });
      }

      const project = clean(body?.project, 64);
      if (!allowedOrigin(origin, project)) {
        return new Response(JSON.stringify({ ok: false, error: 'origin_not_allowed' }), {
          status: 403,
          headers: cors(origin),
        });
      }

      try {
        await record(env, body);
      } catch (error) {
        const invalid = error instanceof Error && error.message === 'invalid_event';
        return new Response(
          JSON.stringify({ ok: false, error: invalid ? 'invalid_event' : 'storage_unavailable' }),
          {
            status: invalid ? 400 : 503,
            headers: cors(origin),
          },
        );
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
