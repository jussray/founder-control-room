import { expect, test } from '@playwright/test';

const baseURL = process.env.FCR_RUNTIME_BASE_URL;
const founderBearer = process.env.FCR_PLAYWRIGHT_FOUNDER_BEARER;

test.describe('builder prompt workflow runtime proof', () => {
  test.skip(!baseURL || !founderBearer, 'requires deployed FCR runtime and founder Playwright bearer');

  test('exact runtime exposes bounded n8n execution spine and selects workflows without widening authority', async ({ request }) => {
    const version = await request.get(`${baseURL}/version`);
    expect(version.ok()).toBeTruthy();
    const versionBody = await version.json();
    expect(versionBody.service).toBe('founder-control-room');
    expect(versionBody.gitSha).toMatch(/^[0-9a-f]{40}$/);

    const unauthSpine = await request.get(`${baseURL}/prompt-workflows/execution-spine`);
    expect(unauthSpine.status()).toBe(401);

    const spine = await request.get(`${baseURL}/prompt-workflows/execution-spine`, {
      headers: { Authorization: `Bearer ${founderBearer}` },
    });
    expect(spine.ok()).toBeTruthy();
    expect(await spine.json()).toMatchObject({
      controlPlane: 'founder-control-room',
      reasoningRouter: 'promptos-chief-ai-machine',
      executionSpine: 'n8n-instance-mcp',
      policy: {
        contract: 'fcr/n8n-instance-mcp@v1',
        serverUrl: 'https://jussray.app.n8n.cloud/mcp-server/http',
        authMode: 'oauth',
        providerVerified: false,
        providerVerificationRequired: true,
        selectiveExposureRequired: true,
        autoExposeNewWorkflows: false,
        authority: {
          mcpConnectionGrantsFounderAuthority: false,
          externalToolOutputCanIncreaseAuthority: false,
          workflowExecutionRequiresExistingFcrAuthority: true,
          merge: false,
          deploy: false,
          publish: false,
          spend: false,
          rotateSecrets: false,
        },
      },
      proof: {
        providerStateVerified: false,
        providerNativeReadbackRequired: true,
        exactRuntimeProofRequired: true,
        playwrightRequiredForUiOrBrowserClaims: true,
      },
    });

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
