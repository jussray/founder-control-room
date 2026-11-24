import { describe, expect, it } from 'vitest';
import {
  BIP_CONTROL_ROOM_PROJECT,
  CHIEF_EVIDENCE_ONLY_AUTHORITY,
  createBipChiefEvidenceIngestion,
  createBipChiefEvidenceReceipt,
} from '../bipChiefBridge.js';

const SHA = '579342699fc7fb394cf9684643756cdc8c9342a8';
const RECEIPT_ID = '123e4567-e89b-42d3-a456-426614174000';
const ISSUED_AT = '2026-09-23T04:10:00.000Z';
const RECORDED_AT = '2026-09-23T04:10:01.000Z';

function bipProof(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'juss-proof/v1',
    receiptId: RECEIPT_ID,
    project: BIP_CONTROL_ROOM_PROJECT,
    actor: 'sekret-bip-control-room',
    authority: {
      provider: 'github',
      scope: 'repository',
      target: BIP_CONTROL_ROOM_PROJECT,
      mode: 'verify',
    },
    exactTarget: {
      repository: BIP_CONTROL_ROOM_PROJECT,
      branch: 'main',
      sha: SHA,
    },
    operation: 'exact_head_test_ledger',
    state: 'verified',
    evidence: [{
      type: 'control_room_test_ledger',
      name: 'Sanitized exact-head GitHub check ledger',
      state: 'verified',
      ref: `artifact:control-room-test-ledger-${SHA}`,
      sha256: 'a'.repeat(64),
    }],
    acknowledges: [],
    dependsOn: [],
    supersedes: [],
    nextAuthority: 'founder-control-room',
    issuedAt: ISSUED_AT,
    ...overrides,
  };
}

describe('Bip Control Room -> FCR -> Chief evidence bridge', () => {
  it('creates a sanitized evidence-only Chief receipt from the canonical Bip proof', () => {
    const receipt = createBipChiefEvidenceReceipt(bipProof(), RECORDED_AT);

    expect(receipt).toMatchObject({
      schemaVersion: 1,
      workspaceId: 'juss',
      projectId: 'sekret-bip',
      sourceSystem: 'founder-control-room',
      sourceRecordId: RECEIPT_ID,
      sourceRevision: SHA,
      kind: 'workflow',
      subjectType: 'sekret-bip-control-room-proof',
      subjectId: SHA,
      state: 'verified',
      status: 'active',
      authority: CHIEF_EVIDENCE_ONLY_AUTHORITY,
    });
    expect(receipt.sourceRefs).toContain(`juss-proof:${RECEIPT_ID}`);
    expect(receipt.sourceRefs).toContain(`github:${BIP_CONTROL_ROOM_PROJECT}@${SHA}`);
    expect(receipt.authority.permitsExecution).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('journal');
  });

  it('maps non-verified proof states conservatively for Chief', () => {
    expect(createBipChiefEvidenceReceipt(bipProof({ state: 'inferred' }), RECORDED_AT).state)
      .toBe('unknown');
    expect(createBipChiefEvidenceReceipt(bipProof({ state: 'failed' }), RECORDED_AT).state)
      .toBe('blocked');
  });

  it('creates an ingestion packet compatible with Chief evidence semantics', () => {
    const ingestion = createBipChiefEvidenceIngestion(bipProof(), RECORDED_AT);
    expect(ingestion.receiptIds).toEqual([`bip-fcr-${RECEIPT_ID}`]);
    expect(ingestion.evidence).toHaveLength(1);
    expect(ingestion.evidence[0].state).toBe('verified');
    expect(ingestion.authority.permitsApproval).toBe(false);
    expect(ingestion.authority.permitsExecution).toBe(false);
  });

  it('fails closed on wrong project, actor, authority hop, or chronology', () => {
    expect(() => createBipChiefEvidenceReceipt(
      bipProof({ project: 'jussray/other' }),
      RECORDED_AT,
    )).toThrow('bip_bridge_project_mismatch');

    expect(() => createBipChiefEvidenceReceipt(
      bipProof({ actor: 'audit-mirror' }),
      RECORDED_AT,
    )).toThrow('bip_bridge_actor_mismatch');

    expect(() => createBipChiefEvidenceReceipt(
      bipProof({ nextAuthority: 'runtime-provider-mcp' }),
      RECORDED_AT,
    )).toThrow('bip_bridge_next_authority_mismatch');

    expect(() => createBipChiefEvidenceReceipt(
      bipProof(),
      '2026-09-23T04:09:59.000Z',
    )).toThrow('bip_bridge_recorded_before_observed');
  });
});
