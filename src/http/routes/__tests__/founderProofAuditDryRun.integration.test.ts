import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  readSwitch: vi.fn(),
  runDryRun: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mocks.getUser } },
  createSupabaseAuthClient: vi.fn(),
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mocks.from },
}));
vi.mock('../../../switchboard/store.js', () => ({
  readEffectiveDesiredState: mocks.readSwitch,
  SwitchboardError: class SwitchboardError extends Error {},
}));
vi.mock('../../../services/founderProofAuditDryRun.js', () => ({
  runFounderProofAuditInternalDryRun: mocks.runDryRun,
}));

import express from 'express';
import request from 'supertest';
import { founderOsSkillsRouter } from '../founderOsSkills.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer founder-proof-audit-test-token';
const SHA = '922905424693f187c7826ea05e4f5ed07fb186b2';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/founder-os', founderOsSkillsRouter);
  return app;
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function authenticateFounder() {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function dryRunResult(persistence: 'stored' | 'duplicate' | 'conflict' = 'stored') {
  return {
    dryRun: {
      contract: 'fcr/founder-proof-audit-internal-dry-run@v1',
      runtimeSha: SHA,
      testCase: 'founder-proof-audit-lifecycle-smoke',
      sourceEventId: `fcr/founder-proof-audit-internal-dry-run@v1:${SHA}`,
      inputFingerprint: 'f'.repeat(64),
      receipt: {
        contract: 'fcr/founder-proof-audit-lifecycle@v1',
        auditId: 'internal-dry-run-922905424693',
        mode: 'DRY_RUN',
        disposition: 'DRY_RUN_VERIFIED',
        highestTruthPlane: 'AUDIT_EXECUTION',
        recognizedOutcome: 'Dry-run execution verified without commerce or customer delivery.',
        claims: {
          commerceExecutionObserved: false,
          commercePaymentVerified: false,
          commerceStoreAuthorityVerified: false,
          auditExecutionVerified: true,
          deliverySimulationVerified: true,
          deliveryOutcomeVerified: false,
          customerReceiptAcknowledged: false,
          customerValueOutcomeVerified: false,
        },
        authority: {
          observationOnly: true,
          canMutateProduction: false,
          canBypassAccessControls: false,
          canExpandScope: false,
          productionMutationAuthorizationRecorded: false,
        },
        nextGate: 'Acquire separate live authority and outcome evidence.',
      },
      guarantees: {
        shopifyOrderPerformed: false,
        shopifyPaymentPerformed: false,
        customerDeliveryPerformed: false,
        auditedTargetMutationPerformed: false,
        receiptPersistenceOnly: true,
      },
    },
    persistence,
    projectId: 'internal-project-uuid-not-for-response',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GIT_SHA', SHA);
  mocks.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    throw new Error(`Unexpected persistence access: ${table}`);
  });
  mocks.readSwitch.mockResolvedValue('on');
  mocks.runDryRun.mockResolvedValue(dryRunResult());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /founder-os/proof-audit/internal-dry-run', () => {
  it('requires founder authentication before switch or dry-run execution', async () => {
    const response = await request(buildApp())
      .post('/founder-os/proof-audit/internal-dry-run');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Founder session required' });
    expect(mocks.readSwitch).not.toHaveBeenCalled();
    expect(mocks.runDryRun).not.toHaveBeenCalled();
  });

  it('fails closed when the founder privileged-execution switch is off', async () => {
    authenticateFounder();
    mocks.readSwitch.mockResolvedValue('off');

    const response = await request(buildApp())
      .post('/founder-os/proof-audit/internal-dry-run')
      .set('Authorization', BEARER);

    expect(response.status).toBe(423);
    expect(response.body).toMatchObject({
      error: 'founder_switch_off',
      switchId: 'fcr-privileged-execution-master',
      desiredState: 'off',
    });
    expect(mocks.runDryRun).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied JSON or raw request bodies before dry-run execution', async () => {
    authenticateFounder();

    const jsonResponse = await request(buildApp())
      .post('/founder-os/proof-audit/internal-dry-run')
      .set('Authorization', BEARER)
      .send({ evidence: 'caller-controlled' });
    const emptyJsonResponse = await request(buildApp())
      .post('/founder-os/proof-audit/internal-dry-run')
      .set('Authorization', BEARER)
      .send({});
    const rawResponse = await request(buildApp())
      .post('/founder-os/proof-audit/internal-dry-run')
      .set('Authorization', BEARER)
      .set('Content-Type', 'text/plain')
      .send('caller-controlled');

    expect(jsonResponse.status).toBe(400);
    expect(emptyJsonResponse.status).toBe(400);
    expect(rawResponse.status).toBe(400);
    expect(jsonResponse.body).toEqual({
      error: 'Founder Proof Audit internal dry run accepts no request body.',
    });
    expect(emptyJsonResponse.body).toEqual(jsonResponse.body);
    expect(rawResponse.body).toEqual(jsonResponse.body);
    expect(mocks.runDryRun).not.toHaveBeenCalled();
  });

  it('fails closed when deployed runtime identity is absent or not an exact SHA', async () => {
    authenticateFounder();
    vi.stubEnv('GIT_SHA', 'main');

    const response = await request(buildApp())
      .post('/founder-os/proof-audit/internal-dry-run')
      .set('Authorization', BEARER);

    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      error: 'Founder Proof Audit internal dry run requires an exact deployed GIT_SHA.',
    });
    expect(mocks.runDryRun).not.toHaveBeenCalled();
  });

  it('executes the server-generated exact-runtime dry run and returns minimized receipt truth', async () => {
    authenticateFounder();

    const response = await request(buildApp())
      .post('/founder-os/proof-audit/internal-dry-run')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(mocks.readSwitch).toHaveBeenCalledWith('fcr-privileged-execution-master');
    expect(mocks.runDryRun).toHaveBeenCalledTimes(1);
    expect(mocks.runDryRun).toHaveBeenCalledWith(SHA);
    expect(response.body).toMatchObject({
      contract: 'fcr/founder-proof-audit-internal-dry-run@v1',
      runtimeSha: SHA,
      testCase: 'founder-proof-audit-lifecycle-smoke',
      persistence: 'stored',
      receipt: {
        disposition: 'DRY_RUN_VERIFIED',
        highestTruthPlane: 'AUDIT_EXECUTION',
        claims: {
          commercePaymentVerified: false,
          deliveryOutcomeVerified: false,
          customerValueOutcomeVerified: false,
        },
        authority: {
          canMutateProduction: false,
          canBypassAccessControls: false,
          canExpandScope: false,
        },
      },
      guarantees: {
        shopifyOrderPerformed: false,
        shopifyPaymentPerformed: false,
        customerDeliveryPerformed: false,
        auditedTargetMutationPerformed: false,
        receiptPersistenceOnly: true,
      },
    });
    expect(response.body.projectId).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('internal-project-uuid-not-for-response');
  });

  it('returns a conflict as conflict instead of manufacturing a successful receipt write', async () => {
    authenticateFounder();
    mocks.runDryRun.mockResolvedValue(dryRunResult('conflict'));

    const response = await request(buildApp())
      .post('/founder-os/proof-audit/internal-dry-run')
      .set('Authorization', BEARER);

    expect(response.status).toBe(409);
    expect(response.body.persistence).toBe('conflict');
    expect(response.body.receipt.disposition).toBe('DRY_RUN_VERIFIED');
  });
});
