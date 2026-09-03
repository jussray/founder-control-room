import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isRecoverableAbandonedPreclaimReservation } from '../n8nProviderNeutralFounderContentPreparation.js';

const AUTHORIZED_AT = '2026-08-30T22:00:00.000Z';

describe('n8n abandoned pre-claim reservation recovery', () => {
  it('recovers only a pending pre-provider reservation whose lease is demonstrably stale', () => {
    expect(isRecoverableAbandonedPreclaimReservation({
      status: 'pending',
      startedAt: '2026-08-30T21:58:00.000Z',
      providerWriteAttempted: false,
      preclaimRecoveryAuthorizedAt: AUTHORIZED_AT,
    })).toBe(true);

    expect(isRecoverableAbandonedPreclaimReservation({
      status: 'pending',
      startedAt: '2026-08-30T21:58:00.001Z',
      providerWriteAttempted: false,
      preclaimRecoveryAuthorizedAt: AUTHORIZED_AT,
    })).toBe(false);
  });

  it('fails closed without an authoritative current-approval recovery marker', () => {
    expect(isRecoverableAbandonedPreclaimReservation({
      status: 'pending',
      startedAt: '2026-08-30T21:00:00.000Z',
      providerWriteAttempted: false,
      preclaimRecoveryAuthorizedAt: '',
    })).toBe(false);
  });

  it('never classifies a provider-attempted or non-pending execution as abandoned pre-claim work', () => {
    expect(isRecoverableAbandonedPreclaimReservation({
      status: 'pending',
      startedAt: '2026-08-30T21:00:00.000Z',
      providerWriteAttempted: true,
      preclaimRecoveryAuthorizedAt: AUTHORIZED_AT,
    })).toBe(false);
    expect(isRecoverableAbandonedPreclaimReservation({
      status: 'succeeded',
      startedAt: '2026-08-30T21:00:00.000Z',
      providerWriteAttempted: false,
      preclaimRecoveryAuthorizedAt: AUTHORIZED_AT,
    })).toBe(false);
  });

  it('binds recovery authorization after current approval readback and before the atomic claim', () => {
    const adapterSource = readFileSync(fileURLToPath(new URL('../n8nFounderContentAuthorityAdapter.ts', import.meta.url)), 'utf8');
    const preparationSource = readFileSync(fileURLToPath(new URL('../n8nProviderNeutralFounderContentPreparation.ts', import.meta.url)), 'utf8');

    const currentApprovalRead = adapterSource.indexOf('preview = await readCurrentFounderContentApproval');
    const recoveryMarker = adapterSource.indexOf('preclaimRecoveryAuthorizedAt: now');
    const approvalClaim = adapterSource.indexOf('claim = await claimFounderContentApproval');

    expect(currentApprovalRead).toBeGreaterThanOrEqual(0);
    expect(recoveryMarker).toBeGreaterThan(currentApprovalRead);
    expect(approvalClaim).toBeGreaterThan(recoveryMarker);
    expect(preparationSource).toContain(".eq('started_at', text(existing.started_at))");
    expect(preparationSource).toContain(".eq('started_at', reservationGeneration)");
    expect(preparationSource).toContain('reservationGeneration: text(rearmed.started_at)');
    expect(preparationSource).toContain('reservation.reservationGeneration,');
    expect(preparationSource).toContain('finalizeN8nFounderContentExecution(\n            reservation.executionId,\n            reservation.reservationGeneration,');
    expect(preparationSource).toContain('PRECLAIM_RESERVATION_LEASE_MS = 2 * 60 * 1000');
  });

  it('fences stale worker abort and finalization to the exact rearmed generation', () => {
    const generationA = '2026-08-30T21:58:00.000Z';
    const generationB = '2026-08-30T22:00:00.000Z';
    let row = { status: 'pending', startedAt: generationA };

    row = { status: 'pending', startedAt: generationB };
    const transition = (generation: string, status: 'failed' | 'succeeded') => {
      if (row.status !== 'pending' || row.startedAt !== generation) return false;
      row = { ...row, status };
      return true;
    };

    expect(transition(generationA, 'failed')).toBe(false);
    expect(transition(generationA, 'succeeded')).toBe(false);
    expect(transition(generationB, 'succeeded')).toBe(true);
    expect(row).toEqual({ status: 'succeeded', startedAt: generationB });
  });
});
