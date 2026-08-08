import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const composePath = path.resolve(process.cwd(), 'automation/n8n/self-hosted/docker-compose.yml');
const envExamplePath = path.resolve(process.cwd(), 'automation/n8n/self-hosted/.env.example');
const workflowPath = path.resolve(process.cwd(), 'automation/n8n/founder-conveyor.workflow.json');

describe('n8n self-hosted runtime contract', () => {
  it('pins the runtime and keeps the public surface behind loopback or a managed edge', () => {
    const compose = fs.readFileSync(composePath, 'utf8');

    expect(compose).toContain('docker.n8n.io/n8nio/n8n:2.32.6');
    expect(compose).toContain('postgres:16-alpine');
    expect(compose).not.toContain(':latest');
    expect(compose).toContain('"127.0.0.1:${N8N_LOCAL_PORT:-5678}:5678"');
    expect(compose).not.toContain('"0.0.0.0:5678:5678"');
    expect(compose).not.toContain('- "5678:5678"');
  });

  it('requires durable Postgres and n8n credential state', () => {
    const compose = fs.readFileSync(composePath, 'utf8');

    expect(compose).toContain('DB_TYPE: postgresdb');
    expect(compose).toContain('DB_POSTGRESDB_HOST: postgres');
    expect(compose).toContain('DB_POSTGRESDB_SCHEMA: public');
    expect(compose).toContain('n8n_postgres_data:/var/lib/postgresql/data');
    expect(compose).toContain('n8n_data:/home/node/.n8n');
    expect(compose).toContain('N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY:?set N8N_ENCRYPTION_KEY}');
  });

  it('keeps code execution and telemetry bounded for the checked-in receipt workflow', () => {
    const compose = fs.readFileSync(composePath, 'utf8');

    expect(compose).toContain('N8N_RUNNERS_ENABLED: "true"');
    expect(compose).toContain('NODE_FUNCTION_ALLOW_BUILTIN: crypto');
    expect(compose).not.toContain('NODE_FUNCTION_ALLOW_BUILTIN: "*"');
    expect(compose).toContain('N8N_DIAGNOSTICS_ENABLED: "false"');
    expect(compose).toContain('N8N_PERSONALIZATION_ENABLED: "false"');
    expect(compose).toContain('N8N_VERSION_NOTIFICATIONS_ENABLED: "false"');
  });

  it('ships placeholders only and no committed bearer or provider secrets', () => {
    const envExample = fs.readFileSync(envExamplePath, 'utf8');

    expect(envExample).toContain('POSTGRES_PASSWORD=replace-with-long-random-postgres-password');
    expect(envExample).toContain('N8N_ENCRYPTION_KEY=replace-with-long-random-stable-encryption-key');
    expect(envExample).toContain('N8N_PUBLIC_BASE_URL=https://n8n.example.com/');
    expect(envExample).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{12,}/i);
    expect(envExample).not.toMatch(/github_pat_|gh[pousr]_/i);
  });

  it('pairs the runtime with the authenticated inactive conveyor artifact', () => {
    const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    const webhook = workflow.nodes.find((node: { name: string }) => node.name === 'FCR Conveyor Webhook');

    expect(workflow.active).toBe(false);
    expect(webhook.parameters.authentication).toBe('headerAuth');
    expect(webhook.credentials.httpHeaderAuth).toEqual({
      id: 'fcr-conveyor-bearer-auth',
      name: 'FCR Conveyor Bearer Auth',
    });
  });
});
