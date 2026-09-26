import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wrangler = readFileSync(new URL('../../../wrangler.worker.toml', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('../../../config/worker-capability-secrets.json', import.meta.url), 'utf8'),
) as {
  schema: string;
  capabilityOptional: Array<{ name: string; capability: string }>;
};

function requiredSecretNames() {
  const block = wrangler.match(/\[secrets\]\s+required\s*=\s*\[([\s\S]*?)\]/);
  expect(block).not.toBeNull();
  return Array.from(block![1].matchAll(/"([A-Z0-9_]+)"/g), ([, name]) => name);
}

describe('Worker startup vs capability secret contract', () => {
  it('keeps Wrangler deployment-fail secrets scoped to startup-critical bindings', () => {
    expect(requiredSecretNames()).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'FOUNDER_SESSION_ENCRYPTION_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_APP_ID',
      'GITHUB_PRIVATE_KEY',
      'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON',
    ]);
  });

  it('keeps feature credentials discoverable without making them global launch dependencies', () => {
    expect(manifest.schema).toBe('fcr/worker-capability-secrets@v1');
    const optional = manifest.capabilityOptional.map(({ name }) => name);
    expect(optional).toEqual([
      'FCR_REMOTE_MCP_READ_TOKEN',
      'FCR_SHOPIFY_WEBHOOK_SECRET',
      'FCR_COMMERCE_HASH_SALT',
      'TINYFISH_API_KEY',
      'FCR_CLOUDFLARE_MCP_READ_TOKEN',
      'MODEL_API_KEY',
      'FOUNDER_SIGNAL_ENGINE_MCP_TOKEN',
      'ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL',
      'FOUNDER_REVIEW_EMAIL_INGRESS_SECRET',
      'N8N_FOUNDER_CONTENT_WEBHOOK_URL',
      'N8N_FOUNDER_CONTENT_BEARER_TOKEN',
      'N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_FINGERPRINT',
      'N8N_FOUNDER_CONTENT_IDENTITY_HMAC_SECRET',
    ]);
    expect(optional.some((name) => requiredSecretNames().includes(name))).toBe(false);
  });
});
