/**
 * Opt-in Fastlane v1.1 REAL nonproduction runtime witness.
 *
 * This intentionally does NOT run as part of ordinary CI. A distinct API
 * runtime, independently bound exact SHA, founder bearer and explicit bounded
 * provider-spend approval are required. Pages preview routes point to the
 * production API and are forbidden here. No token or verdict text is attached.
 */
import { expect, test } from '@playwright/test';

const SHA = /^[0-9a-f]{40}$/i;
const PROVIDER_REFS = {
  codex: /^provider:openai:[A-Za-z0-9._:-]+$/,
  'claude-code': /^provider:anthropic:[A-Za-z0-9._:-]+$/,
} as const;
type Seat = keyof typeof PROVIDER_REFS;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`BLOCKED: ${name} must be configured for real nonproduction proof`);
  return value;
}

function approvedNonproductionOrigin(raw: string, expectedHostname: string): string {
  const url = new URL(raw);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('BLOCKED: nonproduction API must be an exact HTTPS origin');
  }
  if (hostname !== expectedHostname.toLowerCase() ||
      !/(^|[.-])(nonprod|staging|test|preview)([.-]|$)/.test(hostname) ||
      hostname === 'api.foundercontrolroom.org' ||
      hostname === 'foundercontrolroom.org' ||
      hostname === 'www.foundercontrolroom.org' ||
      hostname === 'founder-control-room.mcgill-raylene.workers.dev' ||
      hostname.endsWith('.pages.dev')) {
    throw new Error('BLOCKED: target is not an isolated, approved nonproduction API');
  }
  return url.origin;
}

function verifiedEvidence(verdict: {
  operator: Seat; state: string; requestHash: string | null;
  responseHash: string | null; evidenceRefs: string[];
}): void {
  expect(verdict.state).toBe('COLLECTED');
  expect(verdict.requestHash).toMatch(/^[0-9a-f]{64}$/);
  expect(verdict.responseHash).toMatch(/^[0-9a-f]{64}$/);
  expect(verdict.evidenceRefs.some((ref) => PROVIDER_REFS[verdict.operator].test(ref))).toBe(true);
  expect(verdict.evidenceRefs.some((ref) => /^simulated:|^test:|^mock:/i.test(ref))).toBe(false);
}

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('Fastlane witness rejects production API and Pages preview routing', () => {
  const good = 'https://fastlane-nonprod.example.test/';
  expect(approvedNonproductionOrigin(good, 'fastlane-nonprod.example.test'))
    .toBe('https://fastlane-nonprod.example.test');
  for (const origin of [
    'https://api.foundercontrolroom.org/',
    'https://foundercontrolroom.org/',
    'https://66fc8d41.founder-control-room.pages.dev/',
    'https://founder-control-room.mcgill-raylene.workers.dev/',
  ]) {
    expect(() => approvedNonproductionOrigin(origin, new URL(origin).hostname)).toThrow('BLOCKED');
  }
});

test('authenticated Playwright reads real Fastlane provider receipts at exact nonproduction SHA', async ({ page }, testInfo) => {
  test.skip(process.env.FASTLANE_NONPROD_LIVE_WITNESS !== 'true',
    'BLOCKED: live provider witness requires an explicitly authorized nonproduction run');

  // Check zero-secret target authority before accessing sensitive credentials.
  const origin = approvedNonproductionOrigin(
    required('FASTLANE_NONPROD_API_ORIGIN'),
    required('FASTLANE_NONPROD_ALLOWED_HOST'),
  );
  if (process.env.FASTLANE_NONPROD_SPEND_APPROVED !== 'true') {
    throw new Error('BLOCKED: separately approved bounded nonproduction provider spend is required');
  }
  const sha = required('FASTLANE_NONPROD_EXPECTED_SHA').toLowerCase();
  if (!SHA.test(sha)) throw new Error('BLOCKED: exact candidate SHA is required');
  const missionId = required('FASTLANE_NONPROD_TEST_MISSION_ID');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(missionId)) {
    throw new Error('BLOCKED: invalid test mission ID');
  }
  const founderBearer = required('FASTLANE_NONPROD_FOUNDER_BEARER');
  const endpoint = `${origin}/missions/${encodeURIComponent(missionId)}/council/fastlane`;
  const version = async () => {
    const response = await page.request.get(`${origin}/version`, {
      headers: {'cache-control': 'no-cache'},
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['x-founder-control-room-service']).toBe('founder-control-room');
    const body = await response.json() as {service?: string;gitSha?: string;environment?: string};
    expect(body.service).toBe('founder-control-room');
    expect(body.gitSha).toBe(sha);
    expect(body.environment).not.toBe('production');
  };

  await version();
  const navigation = await page.goto(`${origin}/version`, {waitUntil: 'domcontentloaded'});
  expect(navigation?.status()).toBe(200);
  await expect(page.locator('body')).toContainText('founder-control-room');

  const unauth = await page.request.post(endpoint, {data: {mode: 'fastlane', goal: 'auth boundary check'}});
  expect(unauth.status()).toBe(401);
  const invalidMode = await page.request.post(endpoint, {
    headers: {Authorization: `Bearer ${founderBearer}`},
    data: {mode: 'unknown', goal: 'must not invoke providers'},
  });
  expect(invalidMode.status()).toBe(400);

  // The only paid call, after exact-head, host, and founder-auth preflight.
  const result = await page.request.post(endpoint, {
    headers: {Authorization: `Bearer ${founderBearer}`},
    timeout: 180_000,
    data: {
      mode: 'fastlane',
      goal: 'Should a read-only nonproduction status summary preserve the original input order?',
      seed: 'A before B before C. Provide a concise evidence-labelled recommendation and no external action.',
      participants: ['codex', 'claude-code'],
      sensitivity: 'public',
      sourceRef: `nonprod:fastlane:${sha}`,
    },
  });
  const body = await result.json() as {
    executionState?: string;
    conversation?: {id?: string};
    result?: {transcript?: {
      contract?: string; state?: string; humanRelay?: boolean;
      stage1?: {complete?: boolean; verdicts?: Array<{
        operator: Seat; state: string; requestHash: string | null;
        responseHash: string | null; evidenceRefs: string[];
      }>};
      stage2?: {unanimous?: boolean;rounds?: Array<Array<{
        operator: Seat; state: string;requestHash: string | null;
        responseHash: string | null;evidenceRefs: string[];
      }>>};
      stage3?: {state?: string;tasks?: Array<{owner?: Seat;acceptance?: string}>};
    }};
  };
  // A 424 is a real founder escalation, never a green result.
  expect(result.status(), 'Fastlane real provider or convergence gate blocked').toBe(202);
  const proof = body.result?.transcript;
  expect(proof?.contract).toBe('fcr.fastlane-council.v1.1');
  expect(proof?.humanRelay).toBe(false);
  expect(proof?.state).toBe('awaiting_acceptance');
  expect(proof?.stage1?.complete).toBe(true);
  expect(proof?.stage1?.verdicts).toHaveLength(2);
  for (const reply of proof?.stage1?.verdicts ?? []) verifiedEvidence(reply);
  expect(proof?.stage2?.unanimous).toBe(true);
  expect(proof?.stage2?.rounds?.length).toBeGreaterThanOrEqual(1);
  expect(proof?.stage2?.rounds?.length).toBeLessThanOrEqual(2);
  for (const round of proof?.stage2?.rounds ?? []) {
    expect(round).toHaveLength(2);
    for (const reply of round) verifiedEvidence(reply);
  }
  expect(proof?.stage3?.state).toBe('AWAITING_ACCEPTANCE');
  expect(proof?.stage3?.tasks?.length).toBeGreaterThan(0);
  for (const task of proof?.stage3?.tasks ?? []) {
    expect(task.acceptance).toBe('PENDING');
    expect(task.owner === 'codex' || task.owner === 'claude-code').toBe(true);
  }
  expect(body.conversation?.id).toBeTruthy();

  const persisted = await page.request.get(
    `${origin}/missions/${encodeURIComponent(missionId)}/council`, {
      headers: {Authorization: `Bearer ${founderBearer}`},
    });
  expect(persisted.status()).toBe(200);
  const history = await persisted.json() as {conversations?: Array<{id: string;transcript?: {contract?: string}}>} ;
  expect(history.conversations?.some((row) =>
    row.id === body.conversation?.id && row.transcript?.contract === 'fcr.fastlane-council.v1.1')).toBe(true);
  await version();

  await testInfo.attach('fastlane-nonproduction-provider-receipts.json', {
    contentType: 'application/json',
    body: JSON.stringify({
      subjectSha: sha, runtimeHost: new URL(origin).hostname,
      conversationId: body.conversation?.id,
      stage1: proof?.stage1?.verdicts?.map((r) =>
        ({operator: r.operator, requestHash: r.requestHash, responseHash: r.responseHash, evidenceRefs: r.evidenceRefs})),
      reasoningRounds: proof?.stage2?.rounds?.length,
      stage3: {state: proof?.stage3?.state, ownerAcceptance: 'PENDING'},
      liveProviderProof: true, authorityGranted: false,
    }, null, 2),
  });
});
