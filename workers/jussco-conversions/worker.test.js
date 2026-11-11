import { describe, expect, it } from 'vitest';
import worker from './worker.js';

const ORIGIN = 'https://pappa-razzy-laundry.p9s5nbwqyt.chatgpt.site';

function fakeEnv({ failWrites = false } = {}) {
  const inserts = [];
  const DB = {
    prepare() {
      return {
        first: async () => ({ ok: 1 }),
        bind(...args) {
          return {
            run: async () => {
              if (failWrites) throw new Error('d1 unavailable');
              inserts.push(args);
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { env: { DB }, inserts };
}

async function post(env, body, origin = ORIGIN) {
  return worker.fetch(
    new Request('https://collector.invalid/v1/event', {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe('jussco conversion worker privacy and reliability', () => {
  it('strips query and fragment context before persistence', async () => {
    const { env, inserts } = fakeEnv();
    const response = await post(env, {
      project: 'pappa-razzy-laundry',
      event_name: 'pickup_request',
      page_path: '/pickup?email=synthetic%40example.invalid#phone-0000000000',
      cta_location: 'pickup_cta',
      service_context: 'laundry',
      occurred_at: '2026-10-24T12:00:00-04:00',
    });

    expect(response.status).toBe(202);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual([
      'pappa-razzy-laundry',
      'pickup_request',
      '/pickup',
      'pickup_cta',
      'laundry',
      '2026-10-24T16:00:00.000Z',
    ]);
    expect(JSON.stringify(inserts)).not.toContain('synthetic');
    expect(JSON.stringify(inserts)).not.toContain('0000000000');
  });

  it('rejects unknown routes and caller-selected metadata labels', async () => {
    for (const body of [
      {
        project: 'pappa-razzy-laundry',
        event_name: 'pickup_request',
        page_path: '/customer/synthetic@example.invalid',
        cta_location: 'pickup_cta',
        service_context: 'laundry',
      },
      {
        project: 'pappa-razzy-laundry',
        event_name: 'call_click',
        page_path: '/',
        cta_location: 'synthetic@example.invalid',
        service_context: 'laundry',
      },
      {
        project: 'pappa-razzy-laundry',
        event_name: 'directions_click',
        page_path: '/directions',
        cta_location: 'find_us',
        service_context: 'customer-0000000000',
      },
    ]) {
      const { env, inserts } = fakeEnv();
      const response = await post(env, body);
      expect(response.status).toBe(400);
      expect(inserts).toHaveLength(0);
    }
  });

  it('binds API submission to the configured project origin', async () => {
    const { env, inserts } = fakeEnv();
    const response = await post(env, {
      project: 'pappa-razzy-laundry',
      event_name: 'call_click',
      page_path: '/',
      cta_location: 'primary_call',
      service_context: 'laundry',
    }, 'https://www.jussco.company');

    expect(response.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  it('returns storage_unavailable for API writes when D1 is down', async () => {
    const { env } = fakeEnv({ failWrites: true });
    const response = await post(env, {
      project: 'pappa-razzy-laundry',
      event_name: 'whatsapp_click',
      page_path: '/contact',
      cta_location: 'primary_whatsapp',
      service_context: 'laundry',
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'storage_unavailable' });
  });

  it('never blocks customer redirect actions when D1 is down', async () => {
    const destinations = [
      ['/pappa/call?cta=synthetic@example.invalid', 'tel:+2349135081096'],
      ['/pappa/whatsapp?cta=synthetic@example.invalid', 'https://wa.me/2349135081096'],
      ['/pappa/pickup?cta=synthetic@example.invalid', 'https://wa.me/2349135081096?text='],
      ['/pappa/directions?cta=synthetic@example.invalid', 'https://www.google.com/maps/search/?api=1&query='],
    ];

    for (const [path, expectedPrefix] of destinations) {
      const { env } = fakeEnv({ failWrites: true });
      const response = await worker.fetch(new Request('https://collector.invalid' + path), env);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')?.startsWith(expectedPrefix)).toBe(true);
    }
  });
});
