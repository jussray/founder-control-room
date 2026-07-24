import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFounderSignalEngineMcpHandler,
  type FounderSignalEngineMcpDependencies,
} from '../founderSignalEngineMcp.js';

const TOKEN = 'test-founder-signal-engine-mcp-token';
const ENDPOINT = '/mcp/founder-signal-engine';
const INVOCATION_ID = '123e4567-e89b-42d3-a456-426614174000';
const SOURCE_SHA = 'f4573d360a8fea99b301f33a2a21192525725f7b';

function validArguments(overrides: Record<string, unknown> = {}) {
  return {
    invocationId: INVOCATION_ID,
    sourceRepository: 'jussray/Sekret-Bip',
    sourcePr: 599,
    sourceCommitSha: SOURCE_SHA,
    requestedAction: 'run_openai_step',
    steeringGrantId: 'founder-signal-engine-day3-proof',
    auditPath: 'Founder Control Room issue #73',
    rollbackStep: 'Disable the Zapier Catch Hook and retain the evidence trail.',
    requestingAgent: 'chatgpt',
    allowHubSpotWrite: false,
    ...overrides,
  };
}

function buildApp(overrides: FounderSignalEngineMcpDependencies = {}) {
  const app = express();
  app.use(express.json());
  app.post(ENDPOINT, createFounderSignalEngineMcpHandler({
    env: {
      NODE_ENV: 'test',
      FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: TOKEN,
      ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL: 'https://example.test/zapier-hook',
    },
    fetchFn: vi.fn(async () => new globalThis.Response(JSON.stringify({ runId: 'zap-run-123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch,
    resolveProjectId: vi.fn(async () => 'project-uuid-001'),
    writeAuditEvent: vi.fn(async () => undefined),
    ...overrides,
  }));
  return app;
}

function rpc(method: string, params?: unknown, id: number | string = 1) {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

function toolCall(argumentsValue: unknown) {
  return rpc('tools/call', {
    name: 'invoke_founder_signal_engine',
    arguments: argumentsValue,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Founder Signal Engine remote MCP', () => {
  it('rejects requests without the dedicated MCP bearer token', async () => {
    const response = await request(buildApp()).post(ENDPOINT).send(rpc('tools/list'));

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Unauthorized');
  });

  it('supports initialize and exposes exactly one scoped mutating tool', async () => {
    const app = buildApp();
    const initialized = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('initialize', { protocolVersion: '2025-06-18' }));
    const listed = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('tools/list'));

    expect(initialized.status).toBe(200);
    expect(initialized.body.result.protocolVersion).toBe('2025-06-18');
    expect(listed.status).toBe(200);
    expect(listed.body.result.tools).toHaveLength(1);
    expect(listed.body.result.tools[0]).toMatchObject({
      name: 'invoke_founder_signal_engine',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    });
    expect(listed.body.result.tools[0].inputSchema.additionalProperties).toBe(false);
  });

  it('blocks secret-like material and unexpected arguments before any provider call', async () => {
    const fetchFn = vi.fn(async () => new globalThis.Response(null, { status: 200 })) as typeof fetch;
    const app = buildApp({ fetchFn });
    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments({ apiKey: 'sk-this-should-never-enter-the-tool' })));

    expect(response.status).toBe(400);
    expect(response.body.error.data).toEqual(expect.arrayContaining([
      'unexpected argument: apiKey',
      'arguments must not contain credentials, hook URLs, or secret-like material',
    ]));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires exact founder approval before publication or HubSpot mutation', async () => {
    const fetchFn = vi.fn(async () => new globalThis.Response(null, { status: 200 })) as typeof fetch;
    const app = buildApp({ fetchFn });
    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments({ requestedAction: 'publish_or_send', allowHubSpotWrite: true })));

    expect(response.status).toBe(400);
    expect(response.body.error.data).toContain('founderApprovalId is required for publication, sending, or HubSpot mutation');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('writes audit evidence before and after invoking Zapier and returns the explicit run ID', async () => {
    const auditEvents: Array<{ sourceEventId: string; eventType: string }> = [];
    const writeAuditEvent = vi.fn(async (_projectId: string, event: { sourceEventId: string; eventType: string }) => {
      auditEvents.push(event);
    });
    const fetchFn = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        invocation_id: INVOCATION_ID,
        source_commit_sha: SOURCE_SHA,
        key_reference: 'zapier-founder-signal-engine',
        allow_hubspot_write: false,
      });
      expect(JSON.stringify(body)).not.toContain('sk-');
      return new globalThis.Response(JSON.stringify({ zapier_run_id: 'zap-run-599' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const app = buildApp({ fetchFn, writeAuditEvent });

    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments()));

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(false);
    expect(response.body.result.structuredContent).toMatchObject({
      invocationId: INVOCATION_ID,
      accepted: true,
      zapierRunId: 'zap-run-599',
      auditComplete: true,
      endToEndProofComplete: true,
    });
    expect(auditEvents.map((event) => event.eventType)).toEqual([
      'founder_signal_engine_bridge_requested',
      'founder_signal_engine_bridge_accepted',
    ]);
  });

  it('does not confuse a successful hook acceptance with complete Day 3 proof when no run ID is returned', async () => {
    const fetchFn = vi.fn(async () => new globalThis.Response(JSON.stringify({ status: 'accepted' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
    const app = buildApp({ fetchFn });

    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments()));

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(false);
    expect(response.body.result.structuredContent).toMatchObject({
      accepted: true,
      zapierRunId: null,
      endToEndProofComplete: false,
    });
    expect(response.body.result.content[0].text).toContain('end-to-end proof is still incomplete');
  });

  it('reports provider success as audit-incomplete when the post-call audit write fails', async () => {
    let auditWrites = 0;
    const writeAuditEvent = vi.fn(async () => {
      auditWrites += 1;
      if (auditWrites === 2) throw new Error('audit storage unavailable');
    });
    const app = buildApp({ writeAuditEvent });

    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments()));

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(true);
    expect(response.body.result.structuredContent).toMatchObject({
      accepted: true,
      auditComplete: false,
      endToEndProofComplete: false,
      zapierRunId: 'zap-run-123',
    });
    expect(response.body.result.structuredContent.nextGate).toContain('provider call occurred');
  });
});
