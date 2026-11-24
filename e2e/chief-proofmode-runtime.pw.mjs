import { expect, test } from '@playwright/test';

const baseURL = process.env.PROOFMODE_BASE_URL;
const expectedHead = process.env.EXPECTED_HEAD_SHA;
const accessClientId = process.env.CHIEF_RUNTIME_ACCESS_CLIENT_ID;
const accessClientSecret = process.env.CHIEF_RUNTIME_ACCESS_CLIENT_SECRET;

if (!baseURL) throw new Error('PROOFMODE_BASE_URL is required');
if (!expectedHead || !/^[0-9a-f]{40}$/.test(expectedHead)) {
  throw new Error('EXPECTED_HEAD_SHA must be a lowercase full commit SHA');
}
if (!accessClientId || !accessClientSecret) {
  throw new Error('Trusted Chief runtime proof requires the protected Access client credential pair');
}

const accessHeaders = {
  'CF-Access-Client-Id': accessClientId,
  'CF-Access-Client-Secret': accessClientSecret,
};

async function postMcp(request, message) {
  return request.post(`${baseURL}/mcp`, {
    headers: {
      ...accessHeaders,
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
    },
    data: message,
  });
}

test.describe('trusted Chief ProofMode runtime witness', () => {
  test('serves the exact candidate SHA from /version', async ({ request }) => {
    const response = await request.get(`${baseURL}/version`, { headers: accessHeaders });
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, sha: expectedHead });
  });

  test('initializes MCP with the expected ProofMode identity', async ({ request }) => {
    const response = await postMcp(request, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'fcr-chief-runtime-witness', version: '1.0.0' },
      },
    });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.result.protocolVersion).toBe('2025-06-18');
    expect(payload.result.serverInfo.name).toBe('proofmode');
    expect(payload.result.capabilities.tools).toEqual({ listChanged: false });
  });

  test('advertises only the read-only repository audit tool', async ({ request }) => {
    const response = await postMcp(request, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.result.tools).toHaveLength(1);
    expect(payload.result.tools[0].name).toBe('audit_repository');
    expect(payload.result.tools[0].inputSchema.required).toEqual(['owner', 'repo']);
    expect(payload.result.tools[0].inputSchema.properties).not.toHaveProperty('token');
    expect(payload.result.tools[0].annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  test('keeps the legacy MCP transport POST-only', async ({ request }) => {
    const response = await request.get(`${baseURL}/mcp`, { headers: accessHeaders });
    expect(response.status()).toBe(405);
    expect(response.headers().allow).toBe('POST');
  });

  test('audits the exact public Chief head without mutation authority', async ({ request }) => {
    const response = await postMcp(request, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'audit_repository',
        arguments: {
          owner: 'jussray',
          repo: 'chief-ai-machine',
          ref: expectedHead,
        },
      },
    });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    const result = payload.result.structuredContent;
    const receipt = result.proofReceipt;

    expect(payload.result.isError).toBe(false);
    expect(result.repository).toBe('jussray/chief-ai-machine');
    expect(result.headSha).toBe(expectedHead);
    expect(result.layers.find((layer) => layer.layer === 'verified').state).toBe('not_proven');
    expect(receipt).toMatchObject({
      schema: 'juss-proof/v1',
      project: 'jussray/chief-ai-machine',
      operation: 'repository_evidence_audit',
      state: expect.stringMatching(/^(inferred|unknown)$/),
      exactTarget: {
        repository: 'jussray/chief-ai-machine',
        sha: expectedHead,
      },
    });
    expect(receipt.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'proofmode_layer',
          name: 'verified: not_proven',
          state: 'unknown',
        }),
      ]),
    );
  });
});
