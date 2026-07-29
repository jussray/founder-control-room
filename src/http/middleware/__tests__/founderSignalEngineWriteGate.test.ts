import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type {
  FounderSignalAutomationGrant,
  FounderSignalEvidenceReceipt,
} from '../../../lib/founderSignalAutomationPolicy.js';
import {
  createFounderSignalEngineWriteGate,
  type FounderSignalEngineWriteGateDependencies,
} from '../founderSignalEngineWriteGate.js';

const INVOCATION_ID = '123e4567-e89b-42d3-a456-426614174000';
const SOURCE_SHA = 'f4573d360a8fea99b301f33a2a21192525725f7b';
const PROOF_URL = 'https://github.com/jussray/Sekret-Bip/actions/runs/123';

const grant: FounderSignalAutomationGrant = {
  id: 'founder-approved-auto-distribution-v1',
  enabled: true,
  routes: [
    { channel: 'linkedin', audienceSegment: 'build-in-public' },
    { channel: 'gmail', audienceSegment: 'preapproved-potential-investors' },
  ],
  repositories: ['jussray/Sekret-Bip'],
  approvedRecipientIds: ['hubspot-contact-123'],
  expiresAt: null,
};

const evidenceReceipt: FounderSignalEvidenceReceipt = {
  verified: true,
  provider: 'github',
  repository: 'jussray/Sekret-Bip',
  sourceCommitSha: SOURCE_SHA,
  proofUrl: PROOF_URL,
};

function automationCandidate(overrides: Record<string, unknown> = {}) {
  return {
    channel: 'linkedin',
    audienceSegment: 'build-in-public',
    proofUrl: PROOF_URL,
    who: 'Builders, operators, and aligned investors',
    what: 'A verified product milestone shipped',
    where: 'LinkedIn',
    when: 'After exact-head verification passed',
    why: 'It demonstrates execution and product progress',
    how: 'Follow the build or request the proof package',
    ...overrides,
  };
}

function validArguments(overrides: Record<string, unknown> = {}) {
  return {
    invocationId: INVOCATION_ID,
    sourceRepository: 'jussray/Sekret-Bip',
    sourcePr: 599,
    sourceCommitSha: SOURCE_SHA,
    requestedAction: 'publish_or_send',
    steeringGrantId: grant.id,
    auditPath: 'Founder Control Room issue #73',
    rollbackStep: 'Disable the standing grant and retain the evidence trail.',
    requestingAgent: 'chatgpt',
    allowHubSpotWrite: false,
    automationCandidate: automationCandidate(),
    ...overrides,
  };
}

function buildApp(overrides: FounderSignalEngineWriteGateDependencies = {}) {
  const app = express();
  app.use(express.json());
  app.post(
    '/mcp',
    createFounderSignalEngineWriteGate({
      env: {},
      loadGrant: vi.fn(async () => grant),
      resolveTrustedEvidence: vi.fn(async () => evidenceReceipt),
      writePolicyAudit: vi.fn(async () => undefined),
      ...overrides,
    }),
    (req, res) => {
      res.status(200).json({ arguments: req.body.params.arguments });
    },
  );
  return app;
}

function toolCall(argumentsValue: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'invoke_founder_signal_engine',
      arguments: argumentsValue,
    },
  };
}

describe('Founder Signal Engine standing-policy write gate', () => {
  it('permits OpenAI generation, review drafts, and MCP discovery without policy evaluation', async () => {
    const loadGrant = vi.fn(async () => grant);
    const app = buildApp({ loadGrant });

    const openai = await request(app).post('/mcp').send(
      toolCall({ requestedAction: 'run_openai_step', allowHubSpotWrite: false }),
    );
    const reviewDraft = await request(app).post('/mcp').send(
      toolCall({ requestedAction: 'queue_review_draft', allowHubSpotWrite: false }),
    );
    const initialize = await request(app).post('/mcp').send({
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {},
    });

    expect(openai.status).toBe(200);
    expect(reviewDraft.status).toBe(200);
    expect(initialize.status).toBe(200);
    expect(loadGrant).not.toHaveBeenCalled();
  });

  it('blocks caller-supplied approval-looking text before loading the standing grant', async () => {
    const loadGrant = vi.fn(async () => grant);
    const response = await request(buildApp({ loadGrant })).post('/mcp').send(
      toolCall(validArguments({ founderApprovalId: 'yes' })),
    );

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: -32003,
      message: 'Verified Founder Signal authorization is required',
    });
    expect(loadGrant).not.toHaveBeenCalled();
  });

  it('fails closed when the production standing grant is not configured', async () => {
    const response = await request(
      buildApp({ loadGrant: vi.fn(async () => null) }),
    )
      .post('/mcp')
      .send(toolCall(validArguments()));

    expect(response.status).toBe(503);
    expect(response.body.error.message).toBe(
      'Founder Signal automation grant is not configured',
    );
  });

  it('rejects caller-supplied evidence receipts instead of treating them as trusted proof', async () => {
    const response = await request(buildApp()).post('/mcp').send(
      toolCall(
        validArguments({
          automationCandidate: automationCandidate({ evidenceReceipt }),
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.data).toContain(
      'unexpected automationCandidate field: evidenceReceipt',
    );
  });

  it('retains a review-only decision and never reaches the downstream bridge without trusted proof', async () => {
    const writePolicyAudit = vi.fn(async () => undefined);
    const response = await request(
      buildApp({
        resolveTrustedEvidence: vi.fn(async () => null),
        writePolicyAudit,
      }),
    )
      .post('/mcp')
      .send(toolCall(validArguments()));

    expect(response.status).toBe(403);
    expect(response.body.error.data).toMatchObject({
      decision: 'review-only',
      grantId: grant.id,
    });
    expect(response.body.error.data.reasons).toContain(
      'trusted evidence receipt must match repository, commit, and proof URL',
    );
    expect(writePolicyAudit).toHaveBeenCalledOnce();
  });

  it('hard-blocks an investor recipient outside the configured grant', async () => {
    const response = await request(buildApp()).post('/mcp').send(
      toolCall(
        validArguments({
          automationCandidate: automationCandidate({
            channel: 'gmail',
            audienceSegment: 'preapproved-potential-investors',
            where: 'Gmail',
            recipientId: 'hubspot-contact-unapproved',
            recipientSpecificWhy: 'A specific thesis match.',
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    expect(response.body.error.data).toMatchObject({ decision: 'blocked' });
    expect(response.body.error.data.reasons).toContain(
      'investor recipient is outside the approved grant scope',
    );
  });

  it('mints a one-invocation authorization receipt only after policy and audit pass', async () => {
    const writePolicyAudit = vi.fn(async () => undefined);
    const response = await request(buildApp({ writePolicyAudit }))
      .post('/mcp')
      .send(toolCall(validArguments()));

    expect(response.status).toBe(200);
    expect(response.body.arguments.founderApprovalId).toBe(
      `standing-policy:${grant.id}:${INVOCATION_ID}`,
    );
    expect(response.body.arguments.automationCandidate).toBeUndefined();
    expect(writePolicyAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        invocationId: INVOCATION_ID,
        evidenceReceipt,
        result: expect.objectContaining({ decision: 'auto-distribute', grantId: grant.id }),
      }),
    );
  });

  it('fails closed when the policy decision cannot be written to the audit ledger', async () => {
    const response = await request(
      buildApp({
        writePolicyAudit: vi.fn(async () => {
          throw new Error('audit storage unavailable');
        }),
      }),
    )
      .post('/mcp')
      .send(toolCall(validArguments()));

    expect(response.status).toBe(503);
    expect(response.body.error.message).toBe(
      'Founder Signal policy audit could not be retained',
    );
  });
});
