import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../mcp/hub.js', () => ({
  McpHub: class {
    listServers() {
      return [];
    }
  },
}));
vi.mock('../../../mcp/vaultHub.js', () => ({
  hubForMcpProject: vi.fn(),
}));

import {
  createRemoteReadMcpHandler,
  type RemoteReadMcpDependencies,
} from '../remoteReadMcp.js';

const ENDPOINT = '/mcp/read';
const TOKEN = 'test-fcr-read-token';

function rpc(method: string, params?: unknown, id: string | number = 1) {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

function buildApp(overrides: RemoteReadMcpDependencies = {}) {
  const app = express();
  app.use(express.json());
  app.post(
    ENDPOINT,
    createRemoteReadMcpHandler({
      env: { NODE_ENV: 'test', FCR_REMOTE_MCP_READ_TOKEN: TOKEN },
      listServers: () => [
        { id: 'github', label: 'GitHub MCP', configured: true },
        { id: 'cloudflare-api', label: 'Cloudflare API MCP', configured: true },
      ],
      invokeReadTool: vi.fn(async (input) => ({
        ...input,
        policy: { decision: 'allow', risk: 'read', reason: 'read-only' },
        evidenceId: 'evidence-1',
        result: { ok: true },
      })),
      ...overrides,
    }),
  );
  return app;
}

describe('Founder Control Room read-only remote MCP', () => {
  it('fails closed when the dedicated bearer token is missing', async () => {
    const response = await request(buildApp()).post(ENDPOINT).send(rpc('tools/list'));

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Unauthorized');
  });

  it('fails closed when the server token is not configured', async () => {
    const response = await request(
      buildApp({ env: { NODE_ENV: 'test' } }),
    )
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('tools/list'));

    expect(response.status).toBe(503);
    expect(response.body.error.message).toBe('Remote read MCP token is not configured');
  });

  it('negotiates MCP and advertises only read-only tools', async () => {
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
    expect(initialized.body.result).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'founder-control-room-read' },
    });
    expect(listed.status).toBe(200);
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'list_read_servers',
      'invoke_read_tool',
    ]);
    for (const tool of listed.body.result.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
    }
  });

  it('returns only the sanitized registry view through list_read_servers', async () => {
    const listServers = vi.fn(() => [{ id: 'github', configured: true }]);
    const response = await request(buildApp({ listServers }))
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('tools/call', { name: 'list_read_servers', arguments: {} }));

    expect(response.status).toBe(200);
    expect(listServers).toHaveBeenCalledTimes(1);
    expect(response.body.result.structuredContent).toEqual([
      { id: 'github', configured: true },
    ]);
  });

  it('passes only project-scoped read-shaped input into the FCR hub boundary', async () => {
    const invokeReadTool = vi.fn(async () => ({
      policy: { decision: 'allow', risk: 'read' },
      evidenceId: 'evidence-read-1',
      result: { repository: 'jussray/founder-control-room' },
    }));
    const response = await request(buildApp({ invokeReadTool }))
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        rpc('tools/call', {
          name: 'invoke_read_tool',
          arguments: {
            serverId: 'github',
            projectId: 'founder-control-room',
            toolName: 'get_repository',
            arguments: { owner: 'jussray', repo: 'founder-control-room' },
          },
        }),
      );

    expect(response.status).toBe(200);
    expect(invokeReadTool).toHaveBeenCalledWith({
      serverId: 'github',
      projectId: 'founder-control-room',
      toolName: 'get_repository',
      arguments: { owner: 'jussray', repo: 'founder-control-room' },
    });
    expect(response.body.result.structuredContent.evidenceId).toBe('evidence-read-1');
  });

  it('does not accept mission, approval, token, or other authority-bearing fields', async () => {
    const invokeReadTool = vi.fn();
    const response = await request(buildApp({ invokeReadTool }))
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        rpc('tools/call', {
          name: 'invoke_read_tool',
          arguments: {
            serverId: 'github',
            projectId: 'founder-control-room',
            toolName: 'get_repository',
            missionId: 'mission-1',
            approvalId: 'approval-1',
            token: 'never-cross-this-boundary',
          },
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Unexpected invoke_read_tool arguments');
    expect(response.body.error.data).toEqual(['approvalId', 'missionId', 'token']);
    expect(invokeReadTool).not.toHaveBeenCalled();
  });

  it('rejects nested secret-bearing provider arguments before the hub boundary', async () => {
    const invokeReadTool = vi.fn();
    const response = await request(buildApp({ invokeReadTool }))
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        rpc('tools/call', {
          name: 'invoke_read_tool',
          arguments: {
            serverId: 'github',
            projectId: 'founder-control-room',
            toolName: 'get_repository',
            arguments: {
              owner: 'jussray',
              nested: { api_key: 'must-never-cross' },
            },
          },
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Secret-bearing argument key is not allowed');
    expect(invokeReadTool).not.toHaveBeenCalled();
  });

  it('maps FCR policy denials to a blocked MCP response without widening authority', async () => {
    const invokeReadTool = vi.fn(async () => {
      throw new Error(
        'MCP invocation blocked (evidence-blocked): Tool is explicitly denied by the server policy.',
      );
    });
    const response = await request(buildApp({ invokeReadTool }))
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        rpc('tools/call', {
          name: 'invoke_read_tool',
          arguments: {
            serverId: 'github',
            projectId: 'founder-control-room',
            toolName: 'merge_pull_request',
            arguments: {},
          },
        }),
      );

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(-32003);
    expect(response.body.error.message).toContain('explicitly denied');
  });
});
