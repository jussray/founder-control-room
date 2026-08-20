import express from 'express';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: {} }));

import {
  createXEngagementSignalMcpHandler,
  type XEngagementSignalMcpDependencies,
} from '../xEngagementSignalMcp.js';

const TOKEN = 'test-founder-signal-engine-mcp-token';
const ENDPOINT = '/mcp/founder-signal-x-engagement';

function rpc(method: string, params?: unknown, id: number | string = 1) {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

function toolCall(args: unknown) {
  return rpc('tools/call', {
    name: 'get_x_engagement_signal',
    arguments: args,
  });
}

function buildApp(overrides: XEngagementSignalMcpDependencies = {}) {
  const app = express();
  app.use(express.json());
  app.post(
    ENDPOINT,
    createXEngagementSignalMcpHandler({
      env: { FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: TOKEN },
      getSignal: vi.fn(async ({ topic }) => ({
        status: 'UNKNOWN' as const,
        topic,
        reason: 'LIVE_DISABLED' as const,
        source: 'apify' as const,
        actor: 'apidojo/tweet-scraper' as const,
        cached: false,
        observedAt: '2026-08-19T20:00:00.000Z',
        windowStart: '2026-08-17T20:00:00.000Z',
        windowEnd: '2026-08-19T20:00:00.000Z',
      })),
      ...overrides,
    }),
  );
  return app;
}

describe('X engagement read-only MCP', () => {
  it('requires the existing Founder Signal MCP bearer token before tool discovery', async () => {
    const response = await request(buildApp()).post(ENDPOINT).send(rpc('tools/list'));
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Unauthorized');
  });

  it('advertises exactly one observation-only tool', async () => {
    const response = await request(buildApp())
      .post(ENDPOINT)
      .set('authorization', `Bearer ${TOKEN}`)
      .send(rpc('tools/list'));

    expect(response.status).toBe(200);
    const tools = response.body.result.tools;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('get_x_engagement_signal');
    expect(tools[0].annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it('returns UNKNOWN as HOLD without inventing a zero or publication authority', async () => {
    const getSignal = vi.fn(async ({ topic }: { projectId: string; topic: string }) => ({
      status: 'UNKNOWN' as const,
      topic,
      reason: 'APIFY_ERROR' as const,
      source: 'apify' as const,
      actor: 'apidojo/tweet-scraper' as const,
      cached: true,
      observedAt: '2026-08-19T20:00:00.000Z',
      windowStart: '2026-08-17T20:00:00.000Z',
      windowEnd: '2026-08-19T20:00:00.000Z',
    }));
    const response = await request(buildApp({ getSignal }))
      .post(ENDPOINT)
      .set('authorization', `Bearer ${TOKEN}`)
      .send(toolCall({ projectId: 'jbh-private', topic: 'lace wigs' }));

    expect(response.status).toBe(200);
    expect(getSignal).toHaveBeenCalledWith({ projectId: 'jbh-private', topic: 'lace wigs' });
    const structured = response.body.result.structuredContent;
    expect(structured.signal.status).toBe('UNKNOWN');
    expect(structured.signal.topicMedianEngagement).toBeUndefined();
    expect(structured.gate3).toEqual({ state: 'HOLD', reason: 'APIFY_ERROR' });
    expect(structured.authority).toEqual({
      observationOnly: true,
      canPublish: false,
      canChangeContent: false,
      canIncreaseAuthority: false,
    });
  });

  it('returns a known median only as ready for the separate owned-median comparison', async () => {
    const getSignal = vi.fn(async ({ topic }: { projectId: string; topic: string }) => ({
      status: 'KNOWN' as const,
      topic,
      topicMedianEngagement: 815,
      sampleSize: 10,
      topPoolSize: 40,
      qualifyingCount: 50,
      source: 'apify' as const,
      actor: 'apidojo/tweet-scraper' as const,
      cached: false,
      observedAt: '2026-08-19T20:00:00.000Z',
      windowStart: '2026-08-17T20:00:00.000Z',
      windowEnd: '2026-08-19T20:00:00.000Z',
    }));
    const response = await request(buildApp({ getSignal }))
      .post(ENDPOINT)
      .set('authorization', `Bearer ${TOKEN}`)
      .send(toolCall({ projectId: 'chief-ai-machine', topic: 'founder systems' }));

    expect(response.status).toBe(200);
    const structured = response.body.result.structuredContent;
    expect(structured.signal.topicMedianEngagement).toBe(815);
    expect(structured.gate3).toEqual({
      state: 'READY_FOR_MEDIAN_COMPARISON',
      topicMedianEngagement: 815,
    });
    expect(response.body.result.content[0].text).not.toMatch(/PASS|KILL/);
  });

  it('rejects unknown fields and invalid project/topic values before lookup', async () => {
    const getSignal = vi.fn();
    const response = await request(buildApp({ getSignal }))
      .post(ENDPOINT)
      .set('authorization', `Bearer ${TOKEN}`)
      .send(toolCall({ projectId: '', topic: 'x', token: 'must-not-be-accepted' }));

    expect(response.status).toBe(400);
    expect(response.body.error.data).toContain('unexpected argument: token');
    expect(response.body.error.data).toContain('projectId is required');
    expect(getSignal).not.toHaveBeenCalled();
  });

  it('is mounted outside browser CSRF with the shared MCP auth and no write-authority middleware', () => {
    const server = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
    const routeStart = server.indexOf("'/mcp/founder-signal-x-engagement'");
    const csrfStart = server.indexOf('app.use(requireSameOriginBrowserMutation)');
    expect(routeStart).toBeGreaterThan(-1);
    expect(routeStart).toBeLessThan(csrfStart);

    const routeWindow = server.slice(routeStart, routeStart + 400);
    expect(routeWindow).toContain('requireFounderSignalEngineMcpToken');
    expect(routeWindow).toContain('handleXEngagementSignalMcp');
    expect(routeWindow).not.toContain('requireFounderSignalEngineReviewOnly');
  });
});
