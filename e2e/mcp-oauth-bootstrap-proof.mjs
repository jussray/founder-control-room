import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { request as playwrightRequest } from '@playwright/test';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://oojzfmmywbvficgybaxd.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.FOUNDER_API_URL = 'http://127.0.0.1:8787';
process.env.FOUNDER_ALLOWED_ORIGINS = 'http://127.0.0.1:8787';
process.env.FCR_REMOTE_MCP_RESOURCE = 'https://api.foundercontrolroom.org/mcp';

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

try {
  const response = await client.post('/mcp', {
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
  const expectedMetadata =
    'resource_metadata="https://api.foundercontrolroom.org/.well-known/oauth-protected-resource/mcp"';

  if (response.status() !== 401) {
    throw new Error(`Expected unauthenticated POST /mcp to return 401, got ${response.status()}`);
  }
  if (!challenge.startsWith('Bearer ') || !challenge.includes(expectedMetadata)) {
    throw new Error(`Missing OAuth protected-resource challenge: ${challenge || '<empty>'}`);
  }
  if (body?.error?.message !== 'Unauthorized') {
    throw new Error(`Unexpected MCP bootstrap response: ${JSON.stringify(body)}`);
  }

  const receipt = {
    contract: 'fcr/mcp-oauth-bootstrap-playwright@v1',
    verified: true,
    path: '/mcp',
    status: response.status(),
    protectedResourceMetadata:
      'https://api.foundercontrolroom.org/.well-known/oauth-protected-resource/mcp',
    browserCookieAuthorityUsed: false,
    toolDispatchReached: false,
  };

  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/mcp-oauth-bootstrap-proof.json',
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
