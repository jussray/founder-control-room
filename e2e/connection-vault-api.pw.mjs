import { test, expect } from '@playwright/test';
import express from 'express';
import { connectionVaultRouter } from '../dist/http/routes/connectionVault.js';
import {
  resetVaultFake,
  vaultSnapshot,
} from './connection-vault-fake-supabase.mjs';
import { connectionVaultFounderToken } from './connection-vault-fake-auth.mjs';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const CONNECTION_ID = '00000000-0000-4000-8000-000000000002';
const PROJECT_SLUG = 'founder-control-room';
let server;
let baseURL;

function seed() {
  resetVaultFake({
    founder_users: [{ email: 'founder@example.com' }],
    projects: [{
      id: PROJECT_ID,
      slug: PROJECT_SLUG,
      name: 'Founder Control Room',
    }],
    project_connections: [{
      id: CONNECTION_ID,
      project_id: PROJECT_ID,
      connection_type: 'github',
      label: 'production',
      status: 'active',
      authority_level: 'L1',
      capabilities: ['inspect_repos'],
      data_boundary: 'Repository evidence only',
      required_approval: null,
      config: { apiBase: 'https://api.github.com' },
    }],
    connection_vault_bindings: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        project_id: PROJECT_ID,
        connection_id: CONNECTION_ID,
        environment: 'production',
        name: 'MCP_GITHUB_TOKEN',
        kind: 'secret',
        storage_provider: 'cloudflare-secrets-store',
        secret_ref: 'cloudflare-secrets-store://store/github-token',
        variable_value: null,
        status: 'active',
      },
      {
        id: '00000000-0000-4000-8000-000000000004',
        project_id: PROJECT_ID,
        connection_id: CONNECTION_ID,
        environment: 'production',
        name: 'MCP_GITHUB_URL',
        kind: 'variable',
        storage_provider: 'fcr-variable',
        secret_ref: null,
        variable_value: 'https://api.githubcopilot.com/mcp/',
        status: 'active',
      },
    ],
    fcr_api_tokens: [],
    fcr_api_usage_events: [],
  });
}

test.beforeAll(async () => {
  seed();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use('/mcp/vault', connectionVaultRouter);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseURL = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('founder issues, uses, rotates, and revokes a scoped token without exposing provider secrets', async ({ request }) => {
  const founderAuthorization = `Bearer ${connectionVaultFounderToken()}`;

  const issueResponse = await request.post(`${baseURL}/mcp/vault/tokens`, {
    headers: { Authorization: founderAuthorization },
    data: {
      projectSlug: PROJECT_SLUG,
      name: 'Chief production resolver',
      environment: 'production',
      scopes: ['connections:resolve'],
      expiresInMinutes: 30,
    },
  });
  expect(issueResponse.status()).toBe(201);
  const issued = await issueResponse.json();
  expect(issued.token).toMatch(/^fcr_prd_/);
  expect(issued.shownOnce).toBe(true);
  expect(issued.tokenMetadata).not.toHaveProperty('tokenHash');

  const persisted = vaultSnapshot('fcr_api_tokens');
  expect(persisted).toHaveLength(1);
  expect(persisted[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(persisted[0].token_prefix).toBe(issued.token.slice(0, 20));
  expect(JSON.stringify(persisted[0])).not.toContain(issued.token);

  const resolveResponse = await request.get(
    `${baseURL}/mcp/vault/resolve?projectId=${PROJECT_SLUG}&environment=production&capability=inspect_repos`,
    { headers: { Authorization: `Bearer ${issued.token}` } },
  );
  expect(resolveResponse.status()).toBe(200);
  const resolved = await resolveResponse.json();
  expect(resolved.credentialBoundary).toEqual({
    rawCredentialsReturned: false,
    secretReferencesReturned: false,
    secretResolution: 'fcr-internal-only',
  });
  const serialized = JSON.stringify(resolved);
  expect(serialized).not.toContain('cloudflare-secrets-store://store/github-token');
  expect(serialized).not.toContain(issued.token);
  expect(resolved.connections[0].bindings).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'MCP_GITHUB_TOKEN', kind: 'secret', configured: true }),
    expect.objectContaining({
      name: 'MCP_GITHUB_URL',
      kind: 'variable',
      value: 'https://api.githubcopilot.com/mcp/',
    }),
  ]));
  expect(vaultSnapshot('fcr_api_usage_events')).toHaveLength(1);
  expect(vaultSnapshot('fcr_api_tokens')[0].usage_count).toBe(1);

  const rotateResponse = await request.post(`${baseURL}/mcp/vault/tokens/${issued.tokenMetadata.id}/rotate`, {
    headers: { Authorization: founderAuthorization },
    data: {},
  });
  expect(rotateResponse.status()).toBe(200);
  const rotated = await rotateResponse.json();
  expect(rotated.token).toMatch(/^fcr_prd_/);
  expect(rotated.token).not.toBe(issued.token);
  expect(JSON.stringify(vaultSnapshot('fcr_api_tokens')[0])).not.toContain(rotated.token);

  const oldTokenResponse = await request.get(
    `${baseURL}/mcp/vault/resolve?projectId=${PROJECT_SLUG}&environment=production&capability=inspect_repos`,
    { headers: { Authorization: `Bearer ${issued.token}` } },
  );
  expect(oldTokenResponse.status()).toBe(401);

  const newTokenResponse = await request.get(
    `${baseURL}/mcp/vault/resolve?projectId=${PROJECT_SLUG}&environment=production&capability=inspect_repos`,
    { headers: { Authorization: `Bearer ${rotated.token}` } },
  );
  expect(newTokenResponse.status()).toBe(200);

  const revokeResponse = await request.post(`${baseURL}/mcp/vault/tokens/${issued.tokenMetadata.id}/revoke`, {
    headers: { Authorization: founderAuthorization },
    data: {},
  });
  expect(revokeResponse.status()).toBe(200);

  const revokedResponse = await request.get(
    `${baseURL}/mcp/vault/resolve?projectId=${PROJECT_SLUG}&environment=production&capability=inspect_repos`,
    { headers: { Authorization: `Bearer ${rotated.token}` } },
  );
  expect(revokedResponse.status()).toBe(401);
});
