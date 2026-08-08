import { describe, expect, it, vi } from 'vitest';
import {
  createN8nActivationProbeInput,
  runN8nActivationProbe,
} from '../n8nActivationProbe.js';
import { expectedFounderConveyorReceiptId } from '../n8nConveyor.js';

const SHA = 'a'.repeat(40);

describe('n8n live activation probe', () => {
  it('uses one bounded chat-to-workflows transition on the exact head', () => {
    const input = createN8nActivationProbeInput(SHA.toUpperCase());
    expect(input).toEqual({
      runId: `n8n-live-probe-${SHA}`,
      projectSlug: 'founder-control-room',
      goal: 'Verify one bounded Founder Control Room chat-to-workflows transition returns the canonical v2 n8n receipt.',
      fromStage: 'chat',
      toStage: 'workflows',
      expectedHeadSha: SHA,
      evidenceUrls: [],
    });
  });

  it('rejects anything other than a full exact Git SHA', () => {
    expect(() => createN8nActivationProbeInput('abc123')).toThrow(/40-character Git commit SHA/);
  });

  it('passes only when n8n returns the canonical v2 receipt', async () => {
    const input = createN8nActivationProbeInput(SHA);
    const expectedReceipt = expectedFounderConveyorReceiptId(input);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.fromStage).toBe('chat');
      expect(body.toStage).toBe('workflows');
      expect(body.expectedHeadSha).toBe(SHA);
      expect(body.authority).toEqual({
        advanceStage: true,
        merge: false,
        deploy: false,
        publish: false,
        sendExternal: false,
      });
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-secret',
        'X-FCR-Conveyor-Contract': 'v2',
      });
      return new Response(JSON.stringify({ receiptId: expectedReceipt }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const receipt = await runN8nActivationProbe({
      expectedHeadSha: SHA,
      webhookUrl: 'https://n8n.example.com/webhook/fcr',
      bearerToken: 'test-secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(receipt).toMatchObject({
      ok: true,
      expectedHeadSha: SHA,
      fromStage: 'chat',
      toStage: 'workflows',
      receiptId: expectedReceipt,
    });
    expect(JSON.stringify(receipt)).not.toContain('test-secret');
  });

  it('fails closed on receipt drift', async () => {
    await expect(runN8nActivationProbe({
      expectedHeadSha: SHA,
      webhookUrl: 'https://n8n.example.com/webhook/fcr',
      bearerToken: 'test-secret',
      fetchImpl: (async () => new Response(JSON.stringify({
        receiptId: `fcr-conveyor-receipt-v2:${'0'.repeat(64)}`,
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    })).rejects.toThrow(/UPSTREAM_RECEIPT_MISMATCH|canonical v2/);
  });
});
