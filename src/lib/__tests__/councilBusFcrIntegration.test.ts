import { describe, expect, it } from 'vitest';
import {
  returnCouncilToOrigin, type FcrCouncilReturnInput,
  type FcrCouncilBusRuntime, type FcrCouncilRoundReadback,
} from '../councilBusFcrIntegration.js';

function fixture(): {
  input: FcrCouncilReturnInput;
  runtime: FcrCouncilBusRuntime;
  stored: FcrCouncilRoundReadback;
  calls: unknown[];
} {
  const sha = 'a'.repeat(64);
  const stored: FcrCouncilRoundReadback = {
    mission_id: 'mission-one', round: 2,
    transcript: { goal: 'Review source', sourceRef: 'repo-sha', state: 'complete',
      hops: [{ toOperator: 'codex', answer: 'Checked source', evidenceRefs: ['sha:1'] }] },
  };
  const council = { goal: 'Review source', sourceRef: 'repo-sha', fingerprint: sha,
    findings: [{ id: 'codex', finding: 'Checked source', evidenceRefs: ['sha:1'] }] };
  const court = { verdict: 'READY_FOR_EXTERNAL_VERIFICATION',
    fingerprint: 'b'.repeat(64), councilFingerprint: sha };
  const handoff = { councilFingerprint: sha, courtFingerprint: court.fingerprint,
    decisionStatus: court.verdict, deliveryStatus: 'PREPARED_NOT_SENT',
    origin: { agent: 'chatgpt', route: 'founder-relay',
      threadId: 'thread-one', correlationId: 'case-one' } };
  const input: FcrCouncilReturnInput = {
    missionId: 'mission-one', round: 2,
    founder: { userId: 'founder-one', email: 'owner@example.invalid' },
    bundle: { council, court, handoff },
  };
  const calls: unknown[] = [];
  const runtime: FcrCouncilBusRuntime = {
    enabled: async () => true,
    canAccessMission: async () => true,
    loadPersisted: async () => stored,
    deliver: async (context) => {
      calls.push(context);
      return { status: 'ACK_REPORTED_BY_TRUSTED_PORT', delivered: true };
    },
  };
  return { input, runtime, stored, calls };
}

describe('FCR Council Bus protected return adapter boundary', () => {
  it('uses persisted lineage and reports adapter-only ACK, not production proof', async () => {
    const { input, runtime, calls } = fixture();
    const result = await returnCouncilToOrigin(input, runtime);
    expect(result).toEqual({ status: 'ADAPTER_ACK_NOT_INDEPENDENTLY_VERIFIED', productionVerified: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ origin: { agent: 'chatgpt' }, founder: { userId: 'founder-one' } });
  });

  it('fails closed before storage access on a disabled kill switch', async () => {
    const { input, runtime, calls } = fixture();
    runtime.enabled = async () => false;
    runtime.loadPersisted = async () => { throw Error('not called'); };
    await expect(returnCouncilToOrigin(input, runtime)).rejects.toThrow(/disabled/);
    expect(calls).toHaveLength(0);
  });

  it('rejects missing founder session or mission authorization', async () => {
    const first = fixture();
    first.input.founder = null as unknown as FcrCouncilReturnInput['founder'];
    await expect(returnCouncilToOrigin(first.input, first.runtime)).rejects.toThrow(/founder/);
    const second = fixture();
    second.runtime.canAccessMission = async () => false;
    await expect(returnCouncilToOrigin(second.input, second.runtime)).rejects.toThrow(/mission access/);
    expect(second.calls).toHaveLength(0);
  });

  it('refuses missing persistence and tampered Council transcript', async () => {
    const first = fixture();
    first.runtime.loadPersisted = async () => null;
    await expect(returnCouncilToOrigin(first.input, first.runtime)).rejects.toThrow(/persisted/);
    const second = fixture();
    second.stored.transcript.hops[0].answer = 'altered';
    await expect(returnCouncilToOrigin(second.input, second.runtime)).rejects.toThrow(/lineage/);
    expect(second.calls).toHaveLength(0);
  });

  it('does not forward Court HOLD or changed fingerprints', async () => {
    const held = fixture();
    held.input.bundle.court.verdict = 'HOLD';
    held.input.bundle.handoff.decisionStatus = 'HOLD';
    expect(await returnCouncilToOrigin(held.input, held.runtime)).toMatchObject({ status: 'COURT_HOLD' });
    expect(held.calls).toHaveLength(0);
    const altered = fixture();
    altered.input.bundle.handoff.courtFingerprint = 'c'.repeat(64);
    await expect(returnCouncilToOrigin(altered.input, altered.runtime)).rejects.toThrow(/handoff lineage/);
    expect(altered.calls).toHaveLength(0);
  });

  it('rejects fake prior delivery and never upgrades a non-ACK', async () => {
    const premature = fixture();
    premature.input.bundle.handoff.deliveryStatus = 'DELIVERED';
    await expect(returnCouncilToOrigin(premature.input, premature.runtime)).rejects.toThrow(/not prepared/);
    const absent = fixture();
    absent.runtime.deliver = async () => ({ status: 'DUPLICATE_NOT_SENT', delivered: false });
    expect(await returnCouncilToOrigin(absent.input, absent.runtime)).toEqual({
      status: 'NOT_DELIVERED', productionVerified: false,
    });
  });
});
