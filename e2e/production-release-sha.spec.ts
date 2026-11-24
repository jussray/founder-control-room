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

    const readDirectIdentity = async (phase: string) => {
      const nonce = `${Date.now()}-${testInfo.retry}-${phase}`;
      const response = await request.get(`${deployUrl}/version?release_witness=${nonce}`, {
        headers: {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
      });
      expect(response.status()).toBe(200);
      expect(response.headers()['x-founder-control-room-service']).toBe('founder-control-room');
      const body = (await response.json()) as {
        service?: string;
        gitSha?: string | null;
      };
      expect(body.service).toBe('founder-control-room');
      expect(body.gitSha).toBe(expectedReleaseSha);
      return body;
    };

    const readPublicIdentity = async (phase: string) => {
      const nonce = `${Date.now()}-${testInfo.retry}-${phase}`;
      const response = await request.get(`${publicUrl}/version?release_witness=${nonce}`, {
        headers: {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
      });
      expect(response.status()).toBe(200);
      expect(response.headers()['x-founder-control-room-service']).toBe('founder-control-room');
      const body = (await response.json()) as {
        service?: string;
        gitSha?: string | null;
      };
      expect(body.service).toBe('founder-control-room');
      expect(body.gitSha).toBe(expectedReleaseSha);
      return body;
    };

    const directVersionBefore = await readDirectIdentity('before-browser');
    const publicVersionBefore = await readPublicIdentity('before-browser');

    // Browser journey is accepted only after both runtime identity witnesses agree.
    const controlRoomResponse = await page.goto(`${publicUrl}/`, { waitUntil: 'domcontentloaded' });
    expect(controlRoomResponse?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('Founder Control Room');

    // Re-read release identity after the browser journey so a deployment change during the
    // journey cannot combine release-A identity evidence with release-B browser evidence.
    const directVersionAfter = await readDirectIdentity('after-browser');
    const publicVersionAfter = await readPublicIdentity('after-browser');

    await testInfo.attach('production-release-witness.json', {
      body: JSON.stringify(
        {
          expectedReleaseSha,
          directWorkerGitShaBefore: directVersionBefore.gitSha,
          publicProxyGitShaBefore: publicVersionBefore.gitSha,
          directWorkerGitShaAfter: directVersionAfter.gitSha,
          publicProxyGitShaAfter: publicVersionAfter.gitSha,
          service: publicVersionAfter.service,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });

    await page.screenshot({
      path: 'test-results/production-release-witness.png',
      fullPage: true,
    });
  });
});
