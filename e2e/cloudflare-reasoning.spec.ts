import { expect, test } from '@playwright/test';

test('publishes a public-safe Cloudflare reasoning contract', async ({ request }) => {
  const response = await request.get('/cloudflare/contract');
  expect(response.ok()).toBe(true);

  const body = await response.text();
  expect(body).not.toMatch(/CLOUDFLARE_API_TOKEN|SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|BEGIN PRIVATE KEY/i);
  expect(body).not.toMatch(/mcgill\.raylene@gmail\.com|journal|voice_transcript|service_role/i);

  const contract = JSON.parse(body);
  expect(contract).toMatchObject({
    id: 'cloudflare-ooda-reasoner',
    version: '1.1.0',
    command: ':cloudflare reason <project>',
    mode: 'read_only_reasoning',
    sensitiveFieldsIncluded: false,
    approvalCarryForward: false,
  });
  expect(contract.approvalGates).toEqual([
    'create_branch',
    'merge',
    'deploy',
    'rollback',
    'secrets-change',
    'dns-change',
  ]);
  expect(contract.implementationStack).toEqual([
    'reality',
    'redteam-premise',
    'lindy',
    'l99',
    'redteam-plan',
    'ooda',
    'bill-gates',
    'elon-musk',
    'proof',
    'rollback',
    'next-gate',
  ]);
});

test('Cloudflare project reasoning remains founder-protected', async ({ request }) => {
  const response = await request.post('/cloudflare/sekret-bip/reason', {
    data: { desiredCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });

  expect([401, 403]).toContain(response.status());
  const body = await response.text();
  expect(body).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|GITHUB_TOKEN/i);
});

test('health stays public while reasoning mutation remains unavailable', async ({ request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ ok: true });

  const unknownMutation = await request.post('/cloudflare/sekret-bip/deploy', {
    data: { action: 'deploy' },
  });
  // The same-origin browser mutation gate runs before routing, so an
  // unrecognized route never reaches Express's 404 handler -- it fails
  // closed with 403 instead of leaking whether the route exists.
  expect(unknownMutation.status()).toBe(403);
});
