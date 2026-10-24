import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: {},
}));

import {
  createFounderSignalEngineMcpHandler,
  type FounderSignalEngineMcpDependencies,
} from '../founderSignalEngineMcp.js';

const TOKEN = 'test-founder-signal-engine-mcp-token';
const ENDPOINT = '/mcp/founder-signal-engine';
const INVOCATION_ID = '123e4567-e89b-42d3-a456-426614174000';
const SOURCE_SHA = 'f4573d360a8fea99b301f33a2a21192525725f7b';
const GRANT_ID = 'founder-approved-auto-distribution-v1';
const PROOF_URL = 'https://github.com/jussray/Sekret-Bip/actions/runs/123';
const CONTENT_POLICY_VERSION = 'founder-signal-content-v2';

type AuditWriter = NonNullable<FounderSignalEngineMcpDependencies['writeAuditEvent']>;

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
    how: 'Follow the build or answer one focused question',
    ...overrides,
  };
}

function contentPolicyResult(overrides: Record<string, unknown> = {}) {
  return {
    version: CONTENT_POLICY_VERSION,
    intent: 'conversation-research',
    fingerprint:
      'AI delegation trust | founder observation | authority vocabulary | conversation-research | one question',
    freshnessDecision: 'fresh',
    ...overrides,
  };
}

function validArguments(overrides: Record<string, unknown> = {}) {
  return {
    invocationId: INVOCATION_ID,
    sourceRepository: 'jussray/Sekret-Bip',
    sourcePr: 599,
    sourceCommitSha: SOURCE_SHA,
    requestedAction: 'run_openai_step',
    steeringGrantId: 'founder-signal-engine-day3-proof',
    auditPath: 'Founder Control Room content-policy proof',
    rollbackStep: 'Disable the downstream content bridge and retain receipts.',
    requestingAgent: 'content-policy-test',
    allowHubSpotWrite: false,
    founderApprovalId: null,
    automationCandidate: automationCandidate(),
    ...overrides,
  };
}

function buildApp(options: {
  fetchFn?: typeof fetch;
  writeAuditEvent?: AuditWriter;
  standingPolicy?: { grantId: string; invocationId: string } | null;
} = {}) {
  const app = express();
  app.use(express.json());
  app.post(
    ENDPOINT,
    (_req, res, next) => {
      if (options.standingPolicy) {
        res.locals.founderSignalAutomationAuthorization = options.standingPolicy;
      }
      next();
    },
    createFounderSignalEngineMcpHandler({
      env: {
        NODE_ENV: 'test',
        FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: TOKEN,
        ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL: 'https://example.test/zapier-hook',
      },
      fetchFn:
        options.fetchFn ??
        (vi.fn(async () =>
          new globalThis.Response(JSON.stringify({ zapier_run_id: 'zap-run-content-policy' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })) as unknown as typeof fetch),
      resolveProjectId: vi.fn(async () => 'project-uuid-001'),
      writeAuditEvent: options.writeAuditEvent ?? vi.fn(async () => undefined),
    }),
  );
  return app;
}

function rpc(argumentsValue: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'invoke_founder_signal_engine',
      arguments: argumentsValue,
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Founder Signal Engine LinkedIn content policy', () => {
  it('forwards the versioned content policy contract during generation', async () => {
    const fetchFn = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          requested_action: 'run_openai_step',
          content_policy_contract: {
            version: CONTENT_POLICY_VERSION,
            classifyBeforeDrafting: true,
            recentFingerprintRequired: true,
            linkedin: {
              publishRequiresFreshness: 'fresh',
              conversationResearch: {
                publicProofLinkRequired: false,
                projectNameRequired: false,
                humanObservationFirst: true,
                maxInternalWorkflowTerms: 1,
                onePrimaryQuestion: true,
                hashtagRange: [3, 5],
              },
              proofUpdate: {
                verifiedInternalEvidenceRequired: true,
                publicProofLinkRequired: false,
              },
            },
          },
          content_policy_result: null,
        });
        return new globalThis.Response(JSON.stringify({ zapier_run_id: 'zap-run-generation' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    ) as unknown as typeof fetch;

    const response = await request(buildApp({ fetchFn }))
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc(validArguments()));

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(false);
    expect(response.body.result.structuredContent).toMatchObject({
      accepted: true,
      zapierRunId: 'zap-run-generation',
      contentPolicyVersion: CONTENT_POLICY_VERSION,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('blocks LinkedIn publication with no reviewed content-policy result before Zapier', async () => {
    const auditEvents: Array<{ eventType: string; decision: string; metadata: Record<string, unknown> }> = [];
    const writeAuditEvent: AuditWriter = vi.fn(async (_projectId, event) => {
      auditEvents.push({
        eventType: event.eventType,
        decision: event.decision,
        metadata: event.metadata,
      });
    });
    const fetchFn = vi.fn(async () => new globalThis.Response(null, { status: 200 })) as unknown as typeof fetch;

    const response = await request(
      buildApp({
        fetchFn,
        writeAuditEvent,
        standingPolicy: { grantId: GRANT_ID, invocationId: INVOCATION_ID },
      }),
    )
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        rpc(
          validArguments({
            requestedAction: 'publish_or_send',
            steeringGrantId: GRANT_ID,
            founderApprovalId: `standing-policy:${GRANT_ID}:${INVOCATION_ID}`,
          }),
        ),
      );

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(true);
    expect(response.body.result.structuredContent).toMatchObject({
      accepted: false,
      contentPolicyBlocked: true,
      freshnessDecision: null,
      zapierRunIdentified: false,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      eventType: 'founder_signal_engine_content_policy_blocked',
      decision: 'blocked',
      metadata: {
        channel: 'linkedin',
        freshnessDecision: null,
        zapierRunIdentified: false,
      },
    });
  });

  it('keeps revise-angle as a separate blocked receipt and never calls Zapier', async () => {
    const auditEvents: Array<{ eventType: string; metadata: Record<string, unknown> }> = [];
    const writeAuditEvent: AuditWriter = vi.fn(async (_projectId, event) => {
      auditEvents.push({ eventType: event.eventType, metadata: event.metadata });
    });
    const fetchFn = vi.fn(async () => new globalThis.Response(null, { status: 200 })) as unknown as typeof fetch;

    const response = await request(
      buildApp({
        fetchFn,
        writeAuditEvent,
        standingPolicy: { grantId: GRANT_ID, invocationId: INVOCATION_ID },
      }),
    )
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        rpc(
          validArguments({
            requestedAction: 'publish_or_send',
            steeringGrantId: GRANT_ID,
            founderApprovalId: `standing-policy:${GRANT_ID}:${INVOCATION_ID}`,
            contentPolicyResult: contentPolicyResult({ freshnessDecision: 'revise-angle' }),
          }),
        ),
      );

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(true);
    expect(response.body.result.structuredContent).toMatchObject({
      contentPolicyBlocked: true,
      contentIntent: 'conversation-research',
      freshnessDecision: 'revise-angle',
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(auditEvents[0]).toMatchObject({
      eventType: 'founder_signal_engine_content_policy_blocked',
      metadata: {
        contentIntent: 'conversation-research',
        freshnessDecision: 'revise-angle',
      },
    });
  });

  it('allows fresh reviewed LinkedIn publication and forwards the exact policy result', async () => {
    const fetchFn = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          requested_action: 'publish_or_send',
          authorization_mode: 'standing-policy',
          content_policy_result: {
            version: CONTENT_POLICY_VERSION,
            intent: 'conversation-research',
            freshness_decision: 'fresh',
          },
        });
        return new globalThis.Response(JSON.stringify({ zapier_run_id: 'zap-run-fresh' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    ) as unknown as typeof fetch;

    const response = await request(
      buildApp({
        fetchFn,
        standingPolicy: { grantId: GRANT_ID, invocationId: INVOCATION_ID },
      }),
    )
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        rpc(
          validArguments({
            requestedAction: 'publish_or_send',
            steeringGrantId: GRANT_ID,
            founderApprovalId: `standing-policy:${GRANT_ID}:${INVOCATION_ID}`,
            contentPolicyResult: contentPolicyResult(),
          }),
        ),
      );

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(false);
    expect(response.body.result.structuredContent).toMatchObject({
      accepted: true,
      zapierRunId: 'zap-run-fresh',
      contentPolicyVersion: CONTENT_POLICY_VERSION,
      contentIntent: 'conversation-research',
      freshnessDecision: 'fresh',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});