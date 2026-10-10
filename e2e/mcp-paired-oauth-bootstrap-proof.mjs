import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { request as playwrightRequest } from '@playwright/test';

const LEGACY_STATIC_TOKEN = 'test-legacy-static-token';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://oojzfmmywbvficgybaxd.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.FOUNDER_API_URL = 'http://127.0.0.1:8787';
process.env.FOUNDER_ALLOWED_ORIGINS = 'http://127.0.0.1:8787';
process.env.FCR_REMOTE_MCP_RESOURCE = 'https://api.foundercontrolroom.org/mcp';
process.env.FCR_REMOTE_MCP_READ_TOKEN = LEGACY_STATIC_TOKEN;

const { createServer } = await import('../dist/http/server.js');
const app = createServer();
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');

const address = server.address();
if (!address || typeof address === 'string') {
  server.close();
  throw new Error('Unable to resolve proof server address');
}

const baseURL = `http://127.0.0.1:${address.port}`;
const client = await playwrightRequest.newContext({ baseURL });
const bootstrapPaths = ['/mcp', '/mcp/read'];

try {
  const expectedMetadata =
    'resource_metadata="https://api.foundercontrolroom.org/.well-known/oauth-protected-resource/mcp"';
  const pathReceipts = [];

  for (const path of bootstrapPaths) {
    const response = await client.post(path, {
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      },
    });

    const body = await response.json();
    const challenge = response.headers()['www-authenticate'] ?? '';

    if (response.status() !== 401) {
      throw new Error(`Expected unauthenticated POST ${path} to return 401, got ${response.status()}`);
    }
    if (!challenge.startsWith('Bearer ') || !challenge.includes(expectedMetadata)) {
      throw new Error(`Missing OAuth protected-resource challenge on ${path}: ${challenge || '<empty>'}`);
    }
    if (body?.error?.message !== 'Unauthorized') {
      throw new Error(`Unexpected MCP bootstrap response on ${path}: ${JSON.stringify(body)}`);
    }

    pathReceipts.push({ path, status: response.status(), oauthChallenge: true });
  }

  const legacyResponse = await client.post('/mcp/read', {
    headers: {
      authorization: `Bearer ${LEGACY_STATIC_TOKEN}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    },
  });
  const legacyBody = await legacyResponse.json();
  const legacyTools = legacyBody?.result?.tools;
  if (legacyResponse.status() !== 200 || !Array.isArray(legacyTools) || legacyTools.length === 0) {
    throw new Error(
      `Expected exact legacy token to preserve /mcp/read tools/list compatibility, got ${legacyResponse.status()}: ${JSON.stringify(legacyBody)}`,
    );
  }

  const receipt = {
    contract: 'fcr/mcp-paired-oauth-bootstrap-playwright@v3',
    verified: true,
    paths: pathReceipts,
    canonicalPath: '/mcp',
    autoDynamicCompatibilityPath: '/mcp/read',
    legacyStaticFallbackExactMatchOnly: true,
    legacyStaticFallbackVerified: true,
    legacyStaticToolCount: legacyTools.length,
    protectedResourceMetadata:
      'https://api.foundercontrolroom.org/.well-known/oauth-protected-resource/mcp',
    intendedConsumers: ['chatgpt-plugin', 'claude-mcp-connector'],
    sharedContractSurface: true,
    browserCookieAuthorityUsed: false,
    toolDispatchReached: false,
    externalClientRegistrationVerified: false,
    externalClientRoundTripVerified: false,
  };

  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/mcp-paired-oauth-bootstrap-proof.json',
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(receipt));
} finally {
  await client.dispose();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
