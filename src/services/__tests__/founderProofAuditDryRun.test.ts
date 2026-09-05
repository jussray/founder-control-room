import { describe, expect, it, vi } from 'vitest';
import {
  FOUNDER_PROOF_AUDIT_INTERNAL_DRY_RUN_CONTRACT,
  createFounderProofAuditInternalDryRun,
  founderProofAuditDryRunEventMetadata,
  runFounderProofAuditInternalDryRun,
  type FounderProofAuditDryRunStore,
} from '../founderProofAuditDryRun.js';

const SHA = '920135c22e73ae97639b2d61c3c460aff6c6ac29';

describe('Founder Proof Audit internal dry-run runtime service', () => {
  it('builds one deterministic exact-runtime receipt without commerce or customer outcome claims', () => {
    const first = createFounderProofAuditInternalDryRun(SHA.toUpperCase());
    const second = createFounderProofAuditInternalDryRun(SHA);

    expect(first).toEqual(second);
    expect(first.contract).toBe(FOUNDER_PROOF_AUDIT_INTERNAL_DRY_RUN_CONTRACT);
    expect(first.runtimeSha).toBe(SHA);
    expect(first.sourceEventId).toContain(SHA);
    expect(first.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.receipt.disposition).toBe('DRY_RUN_VERIFIED');
    expect(first.receipt.highestTruthPlane).toBe('AUDIT_EXECUTION');
    expect(first.receipt.claims.commerceExecutionObserved).toBe(false);
    expect(first.receipt.claims.commercePaymentVerified).toBe(false);
    expect(first.receipt.claims.auditExecutionVerified).toBe(true);
    expect(first.receipt.claims.deliverySimulationVerified).toBe(true);
    expect(first.receipt.claims.deliveryOutcomeVerified).toBe(false);
    expect(first.receipt.claims.customerReceiptAcknowledged).toBe(false);
    expect(first.receipt.claims.customerValueOutcomeVerified).toBe(false);
    expect(first.receipt.authority.canMutateProduction).toBe(false);
    expect(first.receipt.authority.canBypassAccessControls).toBe(false);
    expect(first.receipt.authority.canExpandScope).toBe(false);
    expect(first.guarantees).toEqual({
      shopifyOrderPerformed: false,
      shopifyPaymentPerformed: false,
      customerDeliveryPerformed: false,
      auditedTargetMutationPerformed: false,
      receiptPersistenceOnly: true,
    });
  });

  it('fails closed without an exact runtime SHA', () => {
    expect(() => createFounderProofAuditInternalDryRun('')).toThrow(
      'FOUNDER_PROOF_AUDIT_DRY_RUN_REQUIRES_EXACT_RUNTIME_SHA',
    );
    expect(() => createFounderProofAuditInternalDryRun('not-a-sha')).toThrow(
      'FOUNDER_PROOF_AUDIT_DRY_RUN_REQUIRES_EXACT_RUNTIME_SHA',
    );
    expect(() => createFounderProofAuditInternalDryRun('a'.repeat(39))).toThrow(
      'FOUNDER_PROOF_AUDIT_DRY_RUN_REQUIRES_EXACT_RUNTIME_SHA',
    );
  });

  it('persists only minimized receipt metadata, not raw lifecycle evidence references', () => {
    const dryRun = createFounderProofAuditInternalDryRun(SHA);
    const metadata = founderProofAuditDryRunEventMetadata(dryRun);
    const serialized = JSON.stringify(metadata);

    expect(metadata).toEqual({
      contract: dryRun.contract,
      runtimeSha: SHA,
      testCase: dryRun.testCase,
      inputFingerprint: dryRun.inputFingerprint,
      receipt: dryRun.receipt,
      guarantees: dryRun.guarantees,
    });
    expect(serialized).not.toContain('authorizedEvidenceRefs');
    expect(serialized).not.toContain('targetRef');
    expect(serialized).not.toContain('objective');
    expect(serialized).not.toContain('evidenceRef');
    expect(serialized).not.toMatch(/password|private[_-]?key|recovery[_-]?code|card[_-]?number/i);
  });

  it('runs through the persistence boundary and preserves the store disposition', async () => {
    const persist = vi.fn(async () => ({ disposition: 'stored' as const, projectId: 'project-fcr' }));
    const store: FounderProofAuditDryRunStore = { persist };

    const result = await runFounderProofAuditInternalDryRun(SHA, store);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(result.dryRun);
    expect(result.persistence).toBe('stored');
    expect(result.projectId).toBe('project-fcr');
    expect(result.dryRun.receipt.disposition).toBe('DRY_RUN_VERIFIED');
  });

  it('preserves duplicate and conflict truth instead of converting either into success', async () => {
    const duplicate = await runFounderProofAuditInternalDryRun(SHA, {
      persist: async () => ({ disposition: 'duplicate', projectId: 'project-fcr' }),
    });
    const conflict = await runFounderProofAuditInternalDryRun(SHA, {
      persist: async () => ({ disposition: 'conflict', projectId: 'project-fcr' }),
    });

    expect(duplicate.persistence).toBe('duplicate');
    expect(conflict.persistence).toBe('conflict');
    expect(duplicate.dryRun.sourceEventId).toBe(conflict.dryRun.sourceEventId);
  });
});
