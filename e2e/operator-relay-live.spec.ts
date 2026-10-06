import { expect, test } from '@playwright/test';

const witnessRequired = process.env.FCR_OPERATOR_RELAY_WITNESS_REQUIRED === 'true';
const publicUrl = (process.env.PUBLIC_URL ?? 'https://foundercontrolroom.org').replace(/\/$/, '');
const deployUrl = (process.env.DEPLOY_URL ?? publicUrl).replace(/\/$/, '');
const expectedReleaseSha = (process.env.EXPECTED_RELEASE_SHA ?? '').trim().toLowerCase();
const oauthToken = (process.env.FCR_OPERATOR_RELAY_OAUTH_TOKEN ?? '').trim();
const targetOperator = (process.env.FCR_OPERATOR_RELAY_TARGET ?? 'codex').trim();

const PROTOCOL_VERSION = '2026-07-28';
const PROVIDER_EVIDENCE = /^provider:[a-z0-9._-]+:[A-Za-z0-9._:-]+$/;

type VersionBody = {
  service?: string;
  gitSha?: string | null;
};

type RelayEnvelope = {
  jsonrpc?: string;
  error?: { code?: number; message?: string };
  result?: {
    structuredContent?: {
      data?: {
        request?: {
          relayId?: string;
          requestHash?: string;
          toOperator?: string;
          authority?: Record<string, boolean>;
        };
        response?: {
          requestHash?: string;
          responseHash?: string;
          fromOperator?: string;
          status?: string;
          evidenceRefs?: string[];
          authorityRequested?: string;
        };
      };
      receipt?: {
        contract?: string;
        id?: string;
        resultHash?: string;
      };
      governanceBoundary?: {
        mutationAuthority?: boolean;
        executionAllowed?: boolean;
        founderApprovalGranted?: boolean;
      };
    };
  };
};

// This proof intentionally uses the canonical OAuth-bound /mcp authority path.
// It does not mount or call the standalone operator-relay scaffold.
test.describe('FCR live operator relay proof', () => {
  test.skip(!witnessRequired, 'live operator relay proof only runs inside an explicitly authorized runtime witness');

  test('binds exact deployed release to a real provider receipt through the browser', async ({ page, request }, testInfo) => {
    expect(expectedReleaseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(oauthToken.length).toBeGreaterThan(0);
    expect(targetOperator).toMatch(/^(gemini|codex|claude-code|perplexity|deepseek|muse)$/);

    const readIdentity = async (origin: string, phase: string) => {
      const nonce = `${Date.now()}-${testInfo.retry}-${phase}`;
      const response = await request.get(`${origin}/version?relay_witness=${nonce}`, {
        headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      });
      expect(response.status()).toBe(200);
      expect(response.headers()['x-founder-control-room-service']).toBe('founder-control-room');
      const body = (await response.json()) as VersionBody;
      expect(body.service).toBe('founder-control-room');
      expect(body.gitSha).toBe(expectedReleaseSha);
      return body;
    };

    await readIdentity(deployUrl, 'direct-before');
    await readIdentity(publicUrl, 'public-before');

    const navigation = await page.goto(`${publicUrl}/`, { waitUntil: 'domcontentloaded' });
    expect(navigation?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('Founder Control Room');

    const relay = await page.evaluate(async ({ token, target, protocol }) => {
      const id = `live-brain-${Date.now()}`;
      const body = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'fcr_relay_operator',
          arguments: {
            targetOperator: target,
            capability: 'research',
            goal: 'Return a concise runtime-proof acknowledgement for this exact bounded relay.',
            contextSummary: 'Founder Control Room live runtime verification. No mutation, merge, deploy, publish, or provider-mutation authority.',
            sensitivity: 'public',
          },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': protocol,
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      };
      const response = await fetch('/mcp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Mcp-Protocol-Version': protocol,
          'Mcp-Method': 'tools/call',
          'Mcp-Name': 'fcr_relay_operator',
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }, { token: oauthToken, target: targetOperator, protocol: PROTOCOL_VERSION });

    expect(relay.status).toBe(200);
    const envelope = relay.body as RelayEnvelope;
    expect(envelope.error).toBeUndefined();
    const structured = envelope.result?.structuredContent;
    expect(structured).toBeTruthy();

    const relayRequest = structured?.data?.request;
    const relayResponse = structured?.data?.response;
    expect(relayRequest?.toOperator).toBe(targetOperator);
    expect(relayRequest?.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(relayRequest?.authority).toEqual({
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    });

    expect(relayResponse?.status).toBe('completed');
    expect(relayResponse?.fromOperator).toBe(targetOperator);
    expect(relayResponse?.requestHash).toBe(relayRequest?.requestHash);
    expect(relayResponse?.responseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(relayResponse?.authorityRequested).toBe('none');
    expect(relayResponse?.evidenceRefs?.length).toBeGreaterThan(0);
    for (const evidenceRef of relayResponse?.evidenceRefs ?? []) {
      expect(evidenceRef).toMatch(PROVIDER_EVIDENCE);
    }

    expect(structured?.receipt?.contract).toBe('founder-control-room/external-mcp-receipt@v1');
    expect(structured?.receipt?.id).toBeTruthy();
    expect(structured?.receipt?.resultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(structured?.governanceBoundary).toMatchObject({
      mutationAuthority: false,
      executionAllowed: false,
      founderApprovalGranted: false,
    });

    await readIdentity(deployUrl, 'direct-after');
    await readIdentity(publicUrl, 'public-after');

    await testInfo.attach('operator-relay-runtime-proof.json', {
      body: JSON.stringify({
        expectedReleaseSha,
        targetOperator,
        relayId: relayRequest?.relayId,
        requestHash: relayRequest?.requestHash,
        responseHash: relayResponse?.responseHash,
        evidenceRefs: relayResponse?.evidenceRefs,
        receiptId: structured?.receipt?.id,
        receiptResultHash: structured?.receipt?.resultHash,
      }, null, 2),
      contentType: 'application/json',
    });
  });
});
