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
    expect(preparationSource).toContain('PRECLAIM_RESERVATION_LEASE_MS = 2 * 60 * 1000');
  });

  it('fences stale abort and every n8n success finalizer to the exact reservation generation', () => {
    const preparationSource = readFileSync(fileURLToPath(new URL('../n8nProviderNeutralFounderContentPreparation.ts', import.meta.url)), 'utf8');
    const coreSource = readFileSync(fileURLToPath(new URL('../n8nFounderContentOrchestrator.ts', import.meta.url)), 'utf8');
    const providerNeutralSource = readFileSync(fileURLToPath(new URL('../n8nProviderNeutralFounderContentOrchestrator.ts', import.meta.url)), 'utf8');

    const abortStart = preparationSource.indexOf('async function abortPreparedFounderContentExecution');
    const prepareStart = preparationSource.indexOf('export async function prepareProviderNeutralN8nFounderContent');
    const abortSource = preparationSource.slice(abortStart, prepareStart);

    expect(abortStart).toBeGreaterThanOrEqual(0);
    expect(abortSource).toContain('reservationStartedAt: string');
    expect(abortSource).toContain(".eq('started_at', generation)");
    expect(preparationSource).toContain('reservation.reservationStartedAt');

    expect(coreSource).toContain('reservationStartedAt: string');
    expect(coreSource).toContain(".eq('started_at', generation)");
    expect(coreSource).toContain('reservation.reservationStartedAt');
    expect(providerNeutralSource).toContain('reservation.reservationStartedAt');
  });

  it('requires the exact active reservation generation to acquire the provider-write boundary before every n8n fetch', () => {
    const preparationSource = readFileSync(fileURLToPath(new URL('../n8nProviderNeutralFounderContentPreparation.ts', import.meta.url)), 'utf8');
    const coreSource = readFileSync(fileURLToPath(new URL('../n8nFounderContentOrchestrator.ts', import.meta.url)), 'utf8');
    const providerNeutralSource = readFileSync(fileURLToPath(new URL('../n8nProviderNeutralFounderContentOrchestrator.ts', import.meta.url)), 'utf8');

    expect(coreSource).toContain('result: { provider_write_attempted: false }');
    expect(coreSource).toContain(".eq('result->>provider_write_attempted', 'false')");
    expect(coreSource).toContain("phase: 'provider_dispatch_started'");
    expect(coreSource).toContain('provider_write_attempted: true');

    const preparedDispatch = preparationSource.indexOf('async dispatch()');
    const preparedLatch = preparationSource.indexOf('await acquireN8nFounderContentProviderWrite', preparedDispatch);
    const preparedFetch = preparationSource.indexOf('await fetchImpl(', preparedDispatch);
    expect(preparedDispatch).toBeGreaterThanOrEqual(0);
    expect(preparedLatch).toBeGreaterThan(preparedDispatch);
    expect(preparedFetch).toBeGreaterThan(preparedLatch);

    const coreDispatch = coreSource.indexOf('export async function dispatchN8nFounderContent');
    const coreLatch = coreSource.indexOf('await acquireN8nFounderContentProviderWrite', coreDispatch);
    const coreFetch = coreSource.indexOf('await (options.fetchImpl ?? fetch)', coreDispatch);
    expect(coreDispatch).toBeGreaterThanOrEqual(0);
    expect(coreLatch).toBeGreaterThan(coreDispatch);
    expect(coreFetch).toBeGreaterThan(coreLatch);

    const providerDispatch = providerNeutralSource.indexOf('export async function dispatchProviderNeutralN8nFounderContent');
    const providerLatch = providerNeutralSource.indexOf('await acquireN8nFounderContentProviderWrite', providerDispatch);
    const providerFetch = providerNeutralSource.indexOf('await (options.fetchImpl ?? fetch)', providerDispatch);
    expect(providerDispatch).toBeGreaterThanOrEqual(0);
    expect(providerLatch).toBeGreaterThan(providerDispatch);
    expect(providerFetch).toBeGreaterThan(providerLatch);
  });
});
