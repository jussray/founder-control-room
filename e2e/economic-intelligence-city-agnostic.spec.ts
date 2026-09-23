import { expect, test } from '@playwright/test';

const fixtureSlugs = ['johnstown-pa', 'portability-test-city'];

test('truthmode contract declares jurisdiction portability and fail-closed invariants', async ({ request }) => {
  const response = await request.get('/economic-intelligence/contract');
  expect(response.ok()).toBeTruthy();

  const contract = await response.json();
  expect(contract.cityAgnostic).toBe(true);
  expect(contract.version).toBe('1.1.0');
  expect(contract.primitives).toEqual(expect.arrayContaining([
    'jurisdiction',
    'organization',
    'source',
    'program',
    'opportunity',
    'signal',
    'outcome',
    'initiative',
    'gate',
    'evidence_receipt',
    'blocker',
  ]));
  expect(contract.invariants).toEqual(expect.arrayContaining([
    expect.stringContaining('Identical signals produce identical scores'),
    expect.stringContaining('fail closed'),
    expect.stringContaining('never create authority'),
    expect.stringContaining('must not be promoted'),
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
      contractVersion: '1.1.0',
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

test('goalfix: Johnstown AI Center exposes the current commercial-site City Hall execution gate', async ({ request }) => {
  const response = await request.get('/economic-intelligence/initiative/johnstown-ai-center');
  expect(response.ok()).toBeTruthy();

  const snapshot = await response.json();
  expect(snapshot.initiativeName).toBe('Johnstown AI Center');
  expect(snapshot.goal).toContain('90-day proof-first launch');
  expect(snapshot.goal).toContain('eligible commercial Johnstown site-control path');
  expect(snapshot.nextGateId).toBe('city_hall_working_meeting');

  const meetingGate = snapshot.gates.find((gate: { id: string }) => gate.id === 'city_hall_working_meeting');
  expect(meetingGate).toEqual(expect.objectContaining({
    status: 'OPEN',
    proofToClear: expect.stringContaining('date/time'),
  }));

  const pilotGate = snapshot.gates.find((gate: { id: string }) => gate.id === 'meeting_ready_pilot');
  expect(pilotGate).toEqual(expect.objectContaining({
    status: 'PARTIAL',
    receiptIds: expect.arrayContaining([
      'plan:johnstown-ai-center:commercial-site:2026-09-23',
      'plan:johnstown-ai-center:success-gates:2026-09-23',
    ]),
  }));
  expect(pilotGate.blockers).toEqual(expect.arrayContaining([
    expect.stringContaining('superseded partner/rented-space'),
  ]));

  const historicalPlan = snapshot.receipts.find(
    (receipt: { id: string }) => receipt.id === 'plan:johnstown-ai-center:2026-09-09',
  );
  expect(historicalPlan).toEqual(expect.objectContaining({
    classification: 'STALE_SUPERSEDED',
    freshness: 'SUPERSEDED',
  }));

  const currentPlan = snapshot.receipts.find(
    (receipt: { id: string }) => receipt.id === 'plan:johnstown-ai-center:commercial-site:2026-09-23',
  );
  expect(currentPlan).toEqual(expect.objectContaining({
    classification: 'VERIFIED_DECISION',
    freshness: 'CURRENT',
    summary: expect.stringContaining('ten part-time roles at $15 per hour'),
  }));
});

test('redteam twin: review, guidance, and financing fit never become approval or authority', async ({ request }) => {
  const response = await request.get('/economic-intelligence/initiative/johnstown-ai-center');
  const snapshot = await response.json();

  expect(snapshot.authority).toEqual(expect.objectContaining({
    kind: 'descriptive_only',
    canAuthorize: false,
  }));
  expect(snapshot.receipts.every(
    (receipt: { authorityEffect: string }) => receipt.authorityEffect === 'none',
  )).toBe(true);

  const serialized = JSON.stringify(snapshot).toLowerCase();
  expect(serialized).not.toContain('city endorsement');
  expect(serialized).not.toContain('loan approved');
  expect(serialized).not.toContain('partnership approved');
});

test('l99: funding and facility blockers stay separate and cannot collapse into a false green', async ({ request }) => {
  const response = await request.get('/economic-intelligence/initiative/johnstown-ai-center');
  const snapshot = await response.json();
  const fundingGate = snapshot.gates.find((gate: { id: string }) => gate.id === 'funding_facility_path');

  expect(fundingGate.status).toBe('BLOCKED');
  expect(fundingGate.proofToClear).toContain('ten part-time $15/hour roles');
  expect(fundingGate.blockers).toEqual(expect.arrayContaining([
    expect.stringContaining('Site control'),
    expect.stringContaining('job-creation'),
    expect.stringContaining('financing-share cap'),
    expect.stringContaining('Owner equity'),
    expect.stringContaining('quotes'),
    expect.stringContaining('not loan approval'),
  ]));
  expect(fundingGate.blockers).toHaveLength(6);
});

test('continuity fingerprint is deterministic, public-safe, and explicitly non-authorizing', async ({ request }) => {
  const first = await request.get('/economic-intelligence/initiative/johnstown-ai-center');
  const second = await request.get('/economic-intelligence/initiative/johnstown-ai-center');
  const firstSnapshot = await first.json();
  const secondSnapshot = await second.json();

  expect(firstSnapshot.continuityFingerprint).toMatch(/^initiative-state-v1:sha256:[0-9a-f]{64}$/);
  expect(firstSnapshot.continuityFingerprint).toBe(secondSnapshot.continuityFingerprint);
  expect(firstSnapshot.authority.canAuthorize).toBe(false);

  const serialized = JSON.stringify(firstSnapshot);
  expect(serialized).not.toContain('@');
  expect(serialized.toLowerCase()).not.toContain('service_role');
  expect(serialized.toLowerCase()).not.toContain('password');
  expect(serialized.toLowerCase()).not.toContain('token=');
});

test('redteam: unknown initiative fails closed instead of borrowing Johnstown state', async ({ request }) => {
  const response = await request.get('/economic-intelligence/initiative/not-a-real-initiative');
  expect(response.status()).toBe(404);
  const payload = await response.json();
  expect(payload.error).toBe('Unknown initiative');
  expect(payload).not.toHaveProperty('gates');
  expect(payload).not.toHaveProperty('receipts');
});
