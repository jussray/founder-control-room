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

 type AuditWriter = NonNullable<FounderSignalEngineMcpDependencies['writeAuditEvent']>;

interface StandingPolicyContext {
  grantId: string;
  invocationId: string;
}

function mockFetch(
  implementation: () => Promise<globalThis.Response>,
): typeof fetch {
  return vi.fn(implementation) as unknown as typeof fetch;
}

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

function freshContentPolicyResult() {
  return {
    version: 'founder-signal-content-v2',
    intent: 'proof-update',
    fingerprint: 'verified milestone | evidence-led update | proof vocabulary | proof-update | follow build',
    freshnessDecision: 'fresh',
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
    auditPath: 'Founder Control Room issue #73',
    rollbackStep: 'Disable the Zapier Catch Hook and retain the evidence trail.',
    requestingAgent: 'chatgpt',
    allowHubSpotWrite: false,
    ...overrides,
  };
}

function buildApp(
  overrides: FounderSignalEngineMcpDependencies = {},
  standingPolicyAuthorization: StandingPolicyContext | null = null,
) {
  const app = express();
  app.use(express.json());
  app.post(
    ENDPOINT,
    (_req, res, next) => {
      if (standingPolicyAuthorization) {
        res.locals.founderSignalAutomationAuthorization = standingPolicyAuthorization;
      }
      next();
    },
    createFounderSignalEngineMcpHandler({
      env: {
        NODE_ENV: 'test',
        FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: TOKEN,
        ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL: 'https://example.test/zapier-hook',
      },
      fetchFn: mockFetch(async () =>
        new globalThis.Response(JSON.stringify({ runId: 'zap-run-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
      resolveProjectId: vi.fn(async () => 'project-uuid-001'),
      writeAuditEvent: vi.fn(async () => undefined),
      ...overrides,
    }),
  );
  return app;
}

function rpc(method: string, params?: unknown, id: number | string = 1) {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

function toolCall(argumentsValue: unknown) {
  return rpc('tools/call', {
    name: 'invoke_founder_signal_engine',
    arguments: argumentsValue,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Founder Signal Engine remote MCP', () => {
  it('rejects requests without the dedicated MCP bearer token', async () => {
    const response = await request(buildApp()).post(ENDPOINT).send(rpc('tools/list'));

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Unauthorized');
  });

  it('supports initialize, a scoped invocation tool and one read-only campaign planner', async () => {
    const app = buildApp();
    const initialized = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('initialize', { protocolVersion: '2025-06-18' }));
    const listed = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('tools/list'));

    expect(initialized.status).toBe(200);
    expect(initialized.body.result.protocolVersion).toBe('2025-06-18');
    expect(listed.status).toBe(200);
    expect(listed.body.result.tools).toHaveLength(3);
    expect(listed.body.result.tools[2]).toMatchObject({
      name: 'review_founder_signal_draft_handoff',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    });
    expect(listed.body.result.tools[1]).toMatchObject({
      name: 'plan_founder_signal_campaign',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    });
    expect(listed.body.result.tools[0]).toMatchObject({
      name: 'invoke_founder_signal_engine',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    });
    expect(listed.body.result.tools[0].inputSchema.additionalProperties).toBe(false);
    expect(listed.body.result.tools[0].inputSchema.properties.automationCandidate).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
  });

  it('plans native image/video and hashtag packages through the MCP with no provider writes', async () => {
    const fetchFn = mockFetch(async () => { throw new Error('unexpected provider call'); });
    const resolveProjectId = vi.fn(async () => { throw new Error('unexpected database read'); });
    const writeAuditEvent = vi.fn(async () => { throw new Error('unexpected database write'); });
    const app=buildApp({fetchFn,resolveProjectId,writeAuditEvent});
    const campaign={
      source:{repository:'jussray/founder-control-room',commitSha:'a'.repeat(40),
        proofUrl:'https://github.com/jussray/founder-control-room/commit/' + 'a'.repeat(40),visibility:'public'},
      strategy:{intent:'proof-update',audience:'Developers reviewing ethical tooling',
        observation:'The strongest update is the one people can actually verify.',
        fact:'The project added a source-bound draft checking module.',
        audienceValue:'Builders can inspect what happened without trusting marketing language.',
        truthBoundary:'No live Buffer delivery or audience impact is proved by this code.',
        callToAction:'What would you want to inspect next?',thesis:'Make proof accessible'},
      topics:['BuildInPublic','DevTools','ResponsibleAI','ProductDesign','Learning'],
      platforms:['linkedin','instagram','youtube'],
    };
    const response=await request(app).post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('tools/call',{name:'plan_founder_signal_campaign',arguments:campaign}));
    expect(response.status).toBe(200);
    expect(response.body.result.structuredContent.contract).toBe('fcr/founder-signal-campaign@v1');
    expect(response.body.result.structuredContent.variants).toHaveLength(3);
    expect(response.body.result.structuredContent.variants[1].media.state).toBe('NOT_RENDERED');
    expect(response.body.result.structuredContent.authority.canPublish).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(resolveProjectId).not.toHaveBeenCalled();
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });

  it('previews source-bound image media handoff under first-party draft contract without provider calls', async () => {
    const fetchFn=mockFetch(async () => { throw new Error('unwanted network call'); });
    const resolveProjectId=vi.fn(async () => { throw new Error('unwanted db read'); });
    const writeAuditEvent=vi.fn(async () => { throw new Error('unwanted db write'); });
    const app=buildApp({fetchFn,resolveProjectId,writeAuditEvent});
    const campaign={
      source:{repository:'jussray/founder-control-room',commitSha:'a'.repeat(40),
        proofUrl:'https://github.com/jussray/founder-control-room/commit/'+'a'.repeat(40),visibility:'public'},
      strategy:{intent:'proof-update',audience:'Builders who value truth',
        observation:'A useful update explains its uncertainty.',
        fact:'This project includes a reversible, testable content control boundary.',
        audienceValue:'A builder can check facts before sharing them.',
        truthBoundary:'The bridge is source code, not confirmed social-provider execution.',
        callToAction:'What would you verify next?',thesis:'Show verifiable progress'},
      topics:['BuildInPublic','DevTools','Transparency','ContentStrategy','ProductDesign'],
      platforms:['linkedin'],
    };
    const asset={
      type:'image',url:'https://cdn.example.org/draft/founder-image.png',sha256:'b'.repeat(64),
      altText:'An accessible diagram of a review first publishing boundary.',
      rights:{basis:'original',receiptUrl:'https://cdn.example.org/rights/founder-image',permissionGranted:true},
      visualVerdict:{contract:'juss/visual-wonder-artifact-verdict',
        state:'PASSED',artifactSha256:'b'.repeat(64)},
    };
    const result=await request(app).post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('tools/call',{name:'review_founder_signal_draft_handoff',
        arguments:{campaign,platform:'linkedin',accountId:'founder-profile-001',media:[asset]}}));
    expect(result.status).toBe(200);
    expect(result.body.result.structuredContent.status).toBe('LOCAL_DRAFT_SHAPE_VALID__PROVIDER_UNVERIFIED');
    expect(result.body.result.structuredContent.preview.mode).toBe('draft');
    expect(result.body.result.structuredContent.authority.canCreateBufferDraft).toBe(false);
    expect(result.body.result.structuredContent.renderedMediaBytesChecked).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(resolveProjectId).not.toHaveBeenCalled();
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects unsafe MCP campaign facts before any provider interaction', async () => {
    const fetchFn=mockFetch(async () => { throw new Error('unexpected provider call'); });
    const response=await request(buildApp({fetchFn})).post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(rpc('tools/call',{name:'plan_founder_signal_campaign',arguments:{
        source:{repository:'jussray/founder-control-room',commitSha:'a'.repeat(40),
          proofUrl:'https://github.com/jussray/founder-control-room/commit/'+'a'.repeat(40),
          visibility:'private'},strategy:{},platforms:['instagram'],topics:['Tech','Build','Trust'],
      }}));
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Invalid campaign brief');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('blocks secret-like material and unexpected arguments before any provider call', async () => {
    const fetchFn = mockFetch(async () => new globalThis.Response(null, { status: 200 }));
    const app = buildApp({ fetchFn });
    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments({ apiKey: 'sk-this-should-never-enter-the-tool' })));

    expect(response.status).toBe(400);
    expect(response.body.error.data).toEqual(
      expect.arrayContaining([
        'unexpected argument: apiKey',
        'arguments must not contain credentials, hook URLs, or secret-like material',
      ]),
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires a founder approval receipt before publication or HubSpot mutation', async () => {
    const fetchFn = mockFetch(async () => new globalThis.Response(null, { status: 200 }));
    const app = buildApp({ fetchFn });
    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        toolCall(
          validArguments({ requestedAction: 'publish_or_send', allowHubSpotWrite: true }),
        ),
      );

    expect(response.status).toBe(400);
    expect(response.body.error.data).toContain(
      'founderApprovalId is required for publication, sending, or HubSpot mutation',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a forged standing-policy receipt without request-local authorization', async () => {
    const fetchFn = mockFetch(async () => new globalThis.Response(null, { status: 200 }));
    const response = await request(buildApp({ fetchFn }))
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        toolCall(
          validArguments({
            requestedAction: 'publish_or_send',
            steeringGrantId: GRANT_ID,
            founderApprovalId: `standing-policy:${GRANT_ID}:${INVOCATION_ID}`,
            automationCandidate: automationCandidate(),
          }),
        ),
      );

    expect(response.status).toBe(400);
    expect(response.body.error.data).toContain(
      'standing-policy authorization must be minted by the runtime policy gate',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('forwards the exact authorized candidate and authorization mode to Zapier', async () => {
    const auditEvents: Array<{
      sourceEventId: string;
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    const writeAuditEvent: AuditWriter = vi.fn(async (_projectId, event) => {
      auditEvents.push({
        sourceEventId: event.sourceEventId,
        eventType: event.eventType,
        metadata: event.metadata,
      });
    });
    const fetchFn = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          invocation_id: INVOCATION_ID,
          source_commit_sha: SOURCE_SHA,
          requested_action: 'publish_or_send',
          authorization_mode: 'standing-policy',
          founder_approval_id: `standing-policy:${GRANT_ID}:${INVOCATION_ID}`,
          automation_candidate: {
            channel: 'linkedin',
            audience_segment: 'build-in-public',
            proof_url: PROOF_URL,
            who: 'Builders, operators, and aligned investors',
            what: 'A verified product milestone shipped',
            where: 'LinkedIn',
            when: 'After exact-head verification passed',
            why: 'It demonstrates execution and product progress',
            how: 'Follow the build or request the proof package',
            recipient_id: null,
            recipient_specific_why: null,
          },
          content_policy_result: {
            version: 'founder-signal-content-v2',
            intent: 'proof-update',
            freshness_decision: 'fresh',
          },
        });
        return new globalThis.Response(JSON.stringify({ zapier_run_id: 'zap-run-policy' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    ) as unknown as typeof fetch;
    const app = buildApp(
      { fetchFn, writeAuditEvent },
      { grantId: GRANT_ID, invocationId: INVOCATION_ID },
    );

    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(
        toolCall(
          validArguments({
            requestedAction: 'publish_or_send',
            steeringGrantId: GRANT_ID,
            founderApprovalId: `standing-policy:${GRANT_ID}:${INVOCATION_ID}`,
            automationCandidate: automationCandidate(),
            contentPolicyResult: freshContentPolicyResult(),
          }),
        ),
      );

    expect(response.status).toBe(200);
    expect(response.body.result.structuredContent).toMatchObject({
      accepted: true,
      zapierRunId: 'zap-run-policy',
      authorizationMode: 'standing-policy',
      channel: 'linkedin',
      contentPolicyVersion: 'founder-signal-content-v2',
      contentIntent: 'proof-update',
      freshnessDecision: 'fresh',
      endToEndProofComplete: false,
    });
    expect(auditEvents[0]?.metadata).toMatchObject({
      authorizationMode: 'standing-policy',
      channel: 'linkedin',
      audienceSegment: 'build-in-public',
      proofUrl: PROOF_URL,
      contentPolicyVersion: 'founder-signal-content-v2',
      contentIntent: 'proof-update',
      freshnessDecision: 'fresh',
    });
  });

  it('identifies the Zapier run without falsely marking Day 3 proof complete', async () => {
    const auditEvents: Array<{
      sourceEventId: string;
      eventType: string;
      metadata: Record<string, unknown>;
    }> = [];
    const writeAuditEvent: AuditWriter = vi.fn(async (_projectId, event) => {
      auditEvents.push({
        sourceEventId: event.sourceEventId,
        eventType: event.eventType,
        metadata: event.metadata,
      });
    });
    const fetchFn = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          invocation_id: INVOCATION_ID,
          source_commit_sha: SOURCE_SHA,
          key_reference: 'zapier-founder-signal-engine',
          allow_hubspot_write: false,
          authorization_mode: 'review-only',
          automation_candidate: null,
        });
        expect(JSON.stringify(body)).not.toContain('sk-');
        return new globalThis.Response(JSON.stringify({ zapier_run_id: 'zap-run-599' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    ) as unknown as typeof fetch;
    const app = buildApp({ fetchFn, writeAuditEvent });

    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments()));

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(false);
    expect(response.body.result.structuredContent).toMatchObject({
      invocationId: INVOCATION_ID,
      accepted: true,
      zapierRunId: 'zap-run-599',
      zapierRunIdentified: true,
      auditComplete: true,
      endToEndProofComplete: false,
    });
    expect(response.body.result.content[0].text).toContain(
      'downstream Day 3 proof is still incomplete',
    );
    expect(auditEvents.map((event) => event.eventType)).toEqual([
      'founder_signal_engine_bridge_requested',
      'founder_signal_engine_bridge_accepted',
    ]);
    expect(auditEvents[1]?.metadata).toMatchObject({
      zapierRunId: 'zap-run-599',
      zapierRunIdentified: true,
      endToEndProofComplete: false,
    });
  });

  it('does not confuse a successful hook acceptance with a Zapier run or Day 3 proof', async () => {
    const fetchFn = mockFetch(async () =>
      new globalThis.Response(JSON.stringify({ status: 'accepted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const app = buildApp({ fetchFn });

    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments()));

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(false);
    expect(response.body.result.structuredContent).toMatchObject({
      accepted: true,
      zapierRunId: null,
      zapierRunIdentified: false,
      endToEndProofComplete: false,
    });
    expect(response.body.result.content[0].text).toContain(
      'end-to-end proof is still incomplete',
    );
  });

  it('reports provider success as audit-incomplete when the post-call audit write fails', async () => {
    let auditWrites = 0;
    const writeAuditEvent: AuditWriter = vi.fn(async () => {
      auditWrites += 1;
      if (auditWrites === 2) throw new Error('audit storage unavailable');
    });
    const app = buildApp({ writeAuditEvent });

    const response = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(toolCall(validArguments()));

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(true);
    expect(response.body.result.structuredContent).toMatchObject({
      accepted: true,
      auditComplete: false,
      zapierRunIdentified: true,
      endToEndProofComplete: false,
      zapierRunId: 'zap-run-123',
    });
    expect(response.body.result.structuredContent.nextGate).toContain('provider call occurred');
  });
});