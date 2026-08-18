import { expect, test } from '@playwright/test';

const productionWitnessRequired = process.env.PRODUCTION_RELEASE_WITNESS_REQUIRED === 'true';
const deployUrl = process.env.DEPLOY_URL?.replace(/\/$/, '') ?? '';
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '') ?? 'https://foundercontrolroom.org';
const expectedReleaseSha = process.env.EXPECTED_RELEASE_SHA?.trim().toLowerCase() ?? '';

test.describe('production exact-SHA release witness', () => {
  test.skip(!productionWitnessRequired, 'production release witness only runs inside the deploy proof chain');

  test('binds Worker identity, public proxy, and browser proof to one exact release', async ({
    page,
    request,
  }, testInfo) => {
    expect(deployUrl, 'DEPLOY_URL must be supplied by the production environment').not.toBe('');
    expect(expectedReleaseSha, 'EXPECTED_RELEASE_SHA must be the exact approved commit').toMatch(
      /^[0-9a-f]{40}$/,
    );

    const nonce = `${Date.now()}-${testInfo.retry}`;
    const directVersionResponse = await request.get(`${deployUrl}/version?release_witness=${nonce}`, {
      headers: {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
    });
    expect(directVersionResponse.status()).toBe(200);
    expect(directVersionResponse.headers()['x-founder-control-room-service']).toBe(
      'founder-control-room',
    );

    const directVersion = (await directVersionResponse.json()) as {
      service?: string;
      gitSha?: string | null;
    };
    expect(directVersion.service).toBe('founder-control-room');
    expect(directVersion.gitSha).toBe(expectedReleaseSha);

    const publicVersionResponse = await page.goto(
      `${publicUrl}/version?release_witness=${nonce}`,
      { waitUntil: 'domcontentloaded' },
    );
    expect(publicVersionResponse?.status()).toBe(200);
    expect(publicVersionResponse?.headers()['x-founder-control-room-service']).toBe(
      'founder-control-room',
    );

    const publicVersionText = await page.locator('body').innerText();
    const publicVersion = JSON.parse(publicVersionText) as {
      service?: string;
      gitSha?: string | null;
    };
    expect(publicVersion.service).toBe('founder-control-room');
    expect(publicVersion.gitSha).toBe(expectedReleaseSha);

    await testInfo.attach('production-release-witness.json', {
      body: JSON.stringify(
        {
          expectedReleaseSha,
          directWorkerGitSha: directVersion.gitSha,
          publicProxyGitSha: publicVersion.gitSha,
          service: publicVersion.service,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });

    // Browser journey is accepted only after both runtime identity witnesses agree.
    const controlRoomResponse = await page.goto(`${publicUrl}/`, { waitUntil: 'domcontentloaded' });
    expect(controlRoomResponse?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('Founder Control Room');
    await page.screenshot({
      path: 'test-results/production-release-witness.png',
      fullPage: true,
    });
  });
});
