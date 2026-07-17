import { expect, test } from '@playwright/test';

const fixtureSlugs = ['johnstown-pa', 'portability-test-city'];

test('truthmode contract declares jurisdiction portability and fail-closed invariants', async ({ request }) => {
  const response = await request.get('/economic-intelligence/contract');
  expect(response.ok()).toBeTruthy();

  const contract = await response.json();
  expect(contract.cityAgnostic).toBe(true);
  expect(contract.primitives).toEqual(expect.arrayContaining([
    'jurisdiction',
    'organization',
    'source',
    'program',
    'opportunity',
    'signal',
    'outcome',
  ]));
  expect(contract.invariants).toEqual(expect.arrayContaining([
    expect.stringContaining('Identical signals produce identical scores'),
    expect.stringContaining('fail closed'),
  ]));
});

test('redteam: two jurisdictions render through the same response contract without data leakage', async ({ request }) => {
  const payloads = await Promise.all(fixtureSlugs.map(async (slug) => {
    const response = await request.get(`/economic-intelligence/demo/${slug}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }));

  for (const payload of payloads) {
    expect(payload).toEqual(expect.objectContaining({
      contractVersion: '1.0.0',
      jurisdiction: expect.any(Object),
      opportunities: expect.any(Array),
      dataClassification: expect.any(String),
    }));
    expect(payload.opportunities.length).toBeGreaterThan(0);
    expect(payload.opportunities).toEqual([...payload.opportunities].sort(
      (left, right) => right.score - left.score,
    ));
    expect(payload.opportunities.every(
      (opportunity: { jurisdictionId: string }) => opportunity.jurisdictionId === payload.jurisdiction.id,
    )).toBe(true);
  }

  const syntheticPayload = JSON.stringify(payloads[1]).toLowerCase();
  expect(syntheticPayload).not.toContain('johnstown');
  expect(syntheticPayload).not.toContain('service_role');
  expect(syntheticPayload).not.toContain('teen_content');
});

test('redteam: scoring is invariant across jurisdiction identity', async ({ request }) => {
  const common = {
    title: 'Same evidence, different jurisdiction',
    category: 'verification',
    sourceIds: ['source:test'],
    signals: { impact: 80, feasibility: 70, evidence: 60, urgency: 50, equity: 40 },
  };

  const [first, second] = await Promise.all([
    request.post('/economic-intelligence/score', {
      data: { ...common, id: 'one', jurisdictionId: 'jurisdiction:one' },
    }),
    request.post('/economic-intelligence/score', {
      data: { ...common, id: 'two', jurisdictionId: 'jurisdiction:two' },
    }),
  ]);

  expect(first.ok()).toBeTruthy();
  expect(second.ok()).toBeTruthy();
  const firstScore = await first.json();
  const secondScore = await second.json();
  expect(firstScore.score).toBe(secondScore.score);
  expect(firstScore.scoreBand).toBe(secondScore.scoreBand);
  expect(firstScore.scoreVersion).toBe(secondScore.scoreVersion);
});

test('redteam: unknown jurisdiction fails closed and never falls back to Johnstown', async ({ request }) => {
  const response = await request.get('/economic-intelligence/demo/not-a-real-jurisdiction');
  expect(response.status()).toBe(404);
  const payload = await response.json();
  expect(payload.error).toBe('Unknown jurisdiction fixture');
  expect(payload).not.toHaveProperty('jurisdiction');
  expect(payload).not.toHaveProperty('opportunities');
});

test('redteam: malformed scoring input is rejected', async ({ request }) => {
  const response = await request.post('/economic-intelligence/score', {
    data: {
      id: 'bad',
      jurisdictionId: 'jurisdiction:test',
      title: 'Bad payload',
      category: 'verification',
      sourceIds: [],
      signals: { impact: 'high' },
    },
  });
  expect(response.status()).toBe(400);
});
