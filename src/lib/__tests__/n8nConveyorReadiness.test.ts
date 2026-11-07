import { describe, expect, it } from 'vitest';
import {
  founderConveyorReadiness,
  resolveFounderConveyorReadiness,
} from '../n8nConveyorReadiness.js';
import type {
  V10ConveyorActivationProbeRecord,
  V10ConveyorReceiptReader,
} from '../v10ConveyorReceiptStore.js';

const ENABLED_CONFIG = {
  configured: true,
  enabled: true,
  webhookUrl: 'https://n8n.example.com/webhook/fcr',
  bearerToken: 'server-side-secret',
} as const;

function activationProbe(expectedHeadSha: string): V10ConveyorActivationProbeRecord {
  return {
    receiptId: `fcr-conveyor-receipt-v3:${'a'.repeat(64)}`,
    runId: `n8n-live-probe-${expectedHeadSha}`,
    projectSlug: 'founder-control-room',
    expectedHeadSha,
    capabilityPlanHash: 'b'.repeat(64),
    registryHash: 'c'.repeat(64),
    fromStage: 'chat',
    toStage: 'workflows',
    requestedAuthority: 'draft',
    executionStatus: 'accepted',
    evidenceDigest: null,
    createdAt: '2026-08-21T21:30:00.000Z',
  };
}

function readerFor(record: V10ConveyorActivationProbeRecord | null): V10ConveyorReceiptReader {
  return { async latestActivationProbe() { return record; } };
}

function liveEnv(gitSha?: string): NodeJS.ProcessEnv {
  return {
    N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
    N8N_CONVEYOR_BEARER_TOKEN: 'server-side-secret',
    N8N_CONVEYOR_ENABLED: 'true',
    ...(gitSha ? { GIT_SHA: gitSha } : {}),
  };
}

describe('n8n conveyor readiness', () => {
  it('reports not-configured when the provider contract is incomplete', () => {
    expect(founderConveyorReadiness({ configured: false, enabled: false, webhookUrl: null, bearerToken: null })).toEqual({
      state: 'not-configured', configured: false, enabled: false, liveProbeRequired: true, liveVerified: false,
      proof: { state: 'not-observed', receiptId: null, expectedHeadSha: null, observedAt: null },
    });
  });

  it('does not call an enabled provider verified without retained live proof', () => {
    expect(founderConveyorReadiness(ENABLED_CONFIG)).toMatchObject({
      state: 'enabled-awaiting-proof', liveProbeRequired: true, liveVerified: false, proof: { state: 'not-observed' },
    });
  });

  it('marks n8n live only when retained activation proof matches the deployed exact SHA', async () => {
    const gitSha = 'd'.repeat(40);
    const result = await resolveFounderConveyorReadiness({ env: liveEnv(gitSha), receiptReader: readerFor(activationProbe(gitSha)) });
    expect(result).toMatchObject({ state: 'enabled-live-verified', liveProbeRequired: false, liveVerified: true, proof: { state: 'verified', expectedHeadSha: gitSha } });
  });

  it('expires live authority after the deployed SHA moves', async () => {
    const runtimeSha = 'e'.repeat(40);
    const historicalSha = 'f'.repeat(40);
    const result = await resolveFounderConveyorReadiness({ env: liveEnv(runtimeSha), receiptReader: readerFor(activationProbe(historicalSha)) });
    expect(result).toMatchObject({ state: 'enabled-awaiting-proof', liveVerified: false, proof: { state: 'stale-head', expectedHeadSha: historicalSha } });
  });

  it('fails closed when runtime SHA or receipt readback is unavailable', async () => {
    expect(await resolveFounderConveyorReadiness({ env: liveEnv(), receiptReader: readerFor(activationProbe('a'.repeat(40))) }))
      .toMatchObject({ state: 'enabled-awaiting-proof', liveVerified: false, proof: { state: 'runtime-sha-unavailable' } });
    const unavailable: V10ConveyorReceiptReader = { async latestActivationProbe() { throw new Error('provider unavailable'); } };
    expect(await resolveFounderConveyorReadiness({ env: liveEnv('1'.repeat(40)), receiptReader: unavailable }))
      .toMatchObject({ state: 'enabled-awaiting-proof', liveVerified: false, proof: { state: 'readback-unavailable' } });
  });
});
