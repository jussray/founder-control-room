import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const { requireFounderMock, rateLimitFounderPermissionsMock } = vi.hoisted(() => ({
  requireFounderMock: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  rateLimitFounderPermissionsMock: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: requireFounderMock,
}));

vi.mock('../../middleware/security.js', () => ({
  rateLimitFounderPermissions: rateLimitFounderPermissionsMock,
}));

import { createPromptOSCommandIntakeRouter } from '../promptOsCommandIntake.js';

const sourceIntent = {
  schema: 'promptos/public-command-intent@v1',
  command: { id: 'fix', token: '/fix', category: 'Build', label: 'Fix' },
  arguments: 'checkout',
  project: 'founder-control-room',
  capabilityId: 'repair',
  route: {
    owner: 'promptos',
    reasoningPlane: 'chief-ai-machine',
    specialistProduct: 'founder-control-room',
    authorityPlane: 'founder-control-room',
  },
  authorityCeiling: 'advisory-only',
  execution: { status: 'not-executed', mutationAuthorized: false },
  evidence: { contract: 'source-and-runtime', staleOnStateChange: true },
  catalogQuery: 'repair',
};

function chiefBinding() {
  return {
    version: vi.fn(),
    ingestBipEvidence: vi.fn(),
    acceptPromptOSCommandIntent: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      service: 'chief-ai',
      rpcContract: 'juss-v10/chief-fcr-rpc@v1',
      promptOSCommandIntentContract: 'promptos/public-command-intent@v1',
      promptOSCommandHandoffContract: 'juss/promptos-chief-fcr-command-handoff@v1',
      releaseSha: 'a'.repeat(40),
      result: {
        contract: 'juss/promptos-chief-fcr-command-handoff@v1',
        sourceIntentContract: 'promptos/public-command-intent@v1',
        sourceIntentFingerprint: '3d9e01299f2e1653464034b50a806e013fd38960ad0785f7801f72bd19513687',
        sourceIntent,
        acceptedBy: 'chief-ai-machine',
        status: 'accepted-for-capability-planning',
        project: 'founder-control-room',
        projectSource: 'promptos-hint',
        capabilityId: 'repair',
        specialistProduct: 'founder-control-room',
        requestedOutcome: 'checkout',
        authorityPlane: 'founder-control-room',
        authorityResolution: 'unresolved',
        actionAuthority: false,
        executionAuthorized: false,
        nextRequiredContract: 'juss-v10/capability-plan@v1',
        handoffFingerprint: 'fd43c94b87930ea17c3ec85419c637218294be55c9c7d7d269796093b779b939',
      },
    }),
  };
}

describe('PromptOS command intake HTTP route', () => {
  it('rate-limits and founder-authenticates before using the Chief private RPC', async () => {
    const router = createPromptOSCommandIntakeRouter(chiefBinding());
    const layer = (router.stack as Array<{ route?: { stack: Array<{ handle: unknown }> } }>)
      .find((candidate) => Boolean(candidate.route));
    const handlers = layer?.route?.stack.map((entry) => entry.handle) ?? [];

    expect(handlers[0]).toBe(rateLimitFounderPermissionsMock);
    expect(handlers[1]).toBe(requireFounderMock);
  });

  it('returns a proposal-only intake and never claims authority resolution or execution', async () => {
    const binding = chiefBinding();
    const app = express();
    app.use(express.json());
    app.use('/promptos', createPromptOSCommandIntakeRouter(binding));

    const response = await request(app)
      .post('/promptos/command-intake')
      .send({ intent: sourceIntent });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      proposalOnly: true,
      acceptedForAuthorityResolution: false,
      executionAuthorized: false,
      nextRequiredContract: 'juss-v10/capability-plan@v1',
      intake: {
        contract: 'juss/fcr-public-command-intake@v1',
        receivedFrom: 'chief-ai-machine',
        project: 'founder-control-room',
        commandId: 'fix',
        capabilityId: 'repair',
        specialistProduct: 'founder-control-room',
        acceptedForCapabilityPlanning: true,
        acceptedForAuthorityResolution: false,
        authorityState: 'unresolved',
        actionAuthority: false,
        executionAuthorized: false,
        chiefReleaseSha: 'a'.repeat(40),
      },
    });
    expect(binding.acceptPromptOSCommandIntent).toHaveBeenCalledOnce();
  });

  it('fails closed when the Chief RPC is not present on the FCR runtime', async () => {
    const app = express();
    app.use(express.json());
    app.use('/promptos', createPromptOSCommandIntakeRouter());

    const response = await request(app)
      .post('/promptos/command-intake')
      .send({ intent: sourceIntent });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'PROMPTOS_CHIEF_COMMAND_RPC_UNAVAILABLE',
    });
  });

  it('rejects extra request fields before calling Chief', async () => {
    const binding = chiefBinding();
    const app = express();
    app.use(express.json());
    app.use('/promptos', createPromptOSCommandIntakeRouter(binding));

    const response = await request(app)
      .post('/promptos/command-intake')
      .send({ intent: sourceIntent, executeNow: true });

    expect(response.status).toBe(400);
    expect(binding.acceptPromptOSCommandIntent).not.toHaveBeenCalled();
  });
});
