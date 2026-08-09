import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  createN8nActivationProbeInput,
  runN8nActivationProbe,
} from '../n8nActivationProbe.js';
import { expectedFounderConveyorReceiptId } from '../n8nConveyor.js';

const SHA = 'a'.repeat(40);
const workflowPath = path.resolve(process.cwd(), '.github/workflows/n8n-conveyor-live-probe.yml');

function capabilityPlan(): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Verify one bounded Founder Control Room chat-to-workflows transition returns the canonical v3 n8n receipt.',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['truthmode'],
    routingReason: 'Chief AI supplied a bounded capability plan for the manual infrastructure probe.',
    capabilities: [{
      id: 'n8n-live-probe',
      version: '1.0.0',
      origin: 'repo-native',
      owner: 'chief-ai-machine',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'draft',
    }],
    proofRequirements: ['canonical v3 receipt'],
    outcomeSignals: ['n8n-receipt-match'],
    rollback: 'Leave the workflow inactive and discard the probe receipt.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

describe('n8n live activation probe', () => {
  it('uses one bounded chat-to-workflows transition on the exact head with a supplied Chief plan', () => {
    const cp = capabilityPlan();
    const input = createN8nActivationProbeInput(SHA.toUpperCase(), cp);
    expect(input).toEqual({
      runId: `n8n-live-probe-${SHA}`,
      projectSlug: 'founder-control-room',
      goal: cp.goal,
      fromStage: 'chat',
      toStage: 'workflows',
      expectedHeadSha: SHA,
      capabilityPlan: cp,
      evidenceUrls: [],
    });
  });

  it('rejects anything other than a full exact Git SHA', () => {
    expect(() => createN8nActivationProbeInput('abc123', capabilityPlan())).toThrow(/40-character Git commit SHA/);
  });

  it('passes only when n8n returns the canonical v3 plan-bound receipt and Supabase audit persistence succeeds', async () => {
    const cp = capabilityPlan();
    const input = createN8nActivationProbeInput(SHA, cp);
    const expectedReceipt = expectedFounderConveyorReceiptId(input);
    const receiptStore = {
      store: vi.fn(async () => 'stored' as const),
    };
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.fromStage).toBe('chat');
      expect(body.toStage).toBe('workflows');
      expect(body.expectedHeadSha).toBe(SHA);
      expect(body.capabilityPlan.planHash).toBe(cp.planHash);
      expect(body.authority).toEqual({
        advanceStage: true,
        merge: false,
        deploy: false,
        publish: false,
        sendExternal: false,
      });
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-secret',
        'X-FCR-Conveyor-Contract': 'v3',
      });
      return new Response(JSON.stringify({ receiptId: expectedReceipt }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const receipt = await runN8nActivationProbe({
      expectedHeadSha: SHA,
      capabilityPlan: cp,
      webhookUrl: 'https://n8n.example.com/webhook/fcr',
      bearerToken: 'test-secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      receiptStore,
    });

    expect(receipt).toMatchObject({
      ok: true,
      expectedHeadSha: SHA,
      capabilityPlanHash: cp.planHash,
      registryHash: cp.registryHash,
      fromStage: 'chat',
      toStage: 'workflows',
      receiptId: expectedReceipt,
    });
    expect(receiptStore.store).toHaveBeenCalledTimes(1);
    expect(receiptStore.store).toHaveBeenCalledWith(expect.objectContaining({
      receiptId: expectedReceipt,
      expectedHeadSha: SHA,
      capabilityPlanHash: cp.planHash,
      registryHash: cp.registryHash,
      executionStatus: 'accepted',
    }));
    expect(JSON.stringify(receipt)).not.toContain('test-secret');
  });

  it('fails closed when required receipt persistence fails after n8n accepts the transition', async () => {
    const cp = capabilityPlan();
    const input = createN8nActivationProbeInput(SHA, cp);
    const expectedReceipt = expectedFounderConveyorReceiptId(input);

    await expect(runN8nActivationProbe({
      expectedHeadSha: SHA,
      capabilityPlan: cp,
      webhookUrl: 'https://n8n.example.com/webhook/fcr',
      bearerToken: 'test-secret',
      fetchImpl: (async () => new Response(JSON.stringify({ receiptId: expectedReceipt }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
      receiptStore: {
        store: vi.fn(async () => {
          throw new Error('audit store unavailable');
        }),
      },
    })).rejects.toThrow(/DISPATCH_AUDIT_INCOMPLETE|could not be persisted/);
  });

  it('fails closed on receipt drift', async () => {
    await expect(runN8nActivationProbe({
      expectedHeadSha: SHA,
      capabilityPlan: capabilityPlan(),
      webhookUrl: 'https://n8n.example.com/webhook/fcr',
      bearerToken: 'test-secret',
      fetchImpl: (async () => new Response(JSON.stringify({
        receiptId: `fcr-conveyor-receipt-v3:${'0'.repeat(64)}`,
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    })).rejects.toThrow(/UPSTREAM_RECEIPT_MISMATCH|canonical v3/);
  });

  it('keeps the GitHub live probe manual-only, exact-head bound, plan-required, persistence-required, and receipt retaining', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\npull_request:/);
    expect(workflow).not.toMatch(/\npush:/);
    expect(workflow).toContain('target_sha:');
    expect(workflow).toContain('capability_plan_json:');
    expect(workflow).toContain('N8N_CONVEYOR_CAPABILITY_PLAN_JSON: ${{ inputs.capability_plan_json }}');
    expect(workflow).toContain('ref: ${{ inputs.target_sha }}');
    expect(workflow).toContain('N8N_CONVEYOR_WEBHOOK_URL: ${{ secrets.N8N_CONVEYOR_WEBHOOK_URL }}');
    expect(workflow).toContain('N8N_CONVEYOR_BEARER_TOKEN: ${{ secrets.N8N_CONVEYOR_BEARER_TOKEN }}');
    expect(workflow).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
    expect(workflow).toContain('FCR_V10_RECEIPT_PERSISTENCE_REQUIRED:');
    expect(workflow).toContain('npx tsx scripts/verify-n8n-conveyor-live.ts');
    expect(workflow).toContain('n8n-live-probe-receipt.json');
    expect(workflow).toContain('actions/upload-artifact@v4');
  });
});
