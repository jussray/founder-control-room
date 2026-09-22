import { expect, test } from '@playwright/test';

const baseURL = process.env.FCR_RUNTIME_BASE_URL;
const founderBearer = process.env.FCR_PLAYWRIGHT_FOUNDER_BEARER;

test.describe('builder prompt workflow runtime proof', () => {
  test.skip(!baseURL || !founderBearer, 'requires deployed FCR runtime and founder Playwright bearer');

  test('exact runtime selects bounded investment workflow and fails closed otherwise', async ({ request }) => {
    const version = await request.get(`${baseURL}/version`);
    expect(version.ok()).toBeTruthy();
    const versionBody = await version.json();
    expect(versionBody.service).toBe('founder-control-room');
    expect(versionBody.gitSha).toMatch(/^[0-9a-f]{40}$/);

    const unauth = await request.post(`${baseURL}/prompt-workflows/select`, {
      data: { intent: 'investment-business' },
    });
    expect(unauth.status()).toBe(401);

    const selected = await request.post(`${baseURL}/prompt-workflows/select`, {
      headers: { Authorization: `Bearer ${founderBearer}` },
      data: { intent: 'investment-business' },
    });
    expect(selected.ok()).toBeTruthy();
    expect(await selected.json()).toMatchObject({
      selection: {
        contract: 'juss/builder-prompt-workflow-router@v1',
        intent: 'investment-business',
        modes: ['investor-redteam', 'money-path', '10truth'],
        authorityChanged: false,
        executionAuthorized: false,
      },
    });

    const unsupported = await request.post(`${baseURL}/prompt-workflows/select`, {
      headers: { Authorization: `Bearer ${founderBearer}` },
      data: { intent: 'do-whatever' },
    });
    expect(unsupported.status()).toBe(400);
  });
});
