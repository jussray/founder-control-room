import { describe, expect, it } from 'vitest';
import {
  BUBBLE_LAB_STOP_LOSS_PCT,
  BUBBLE_LAB_TAKE_PROFIT_PCT,
  evaluateShadowExit,
} from '../bubbleLabShadow.js';

const BASE = {
  assetId: 'paper-token',
  entryPrice: 100,
  observedAt: '2026-09-13T18:30:00.000Z',
  evidenceRef: 'market-observation:paper-token:1',
};

describe('Bubble Lab shadow exit engine', () => {
  it('locks the founder-approved shadow thresholds', () => {
    expect(BUBBLE_LAB_TAKE_PROFIT_PCT).toBe(0.5);
    expect(BUBBLE_LAB_STOP_LOSS_PCT).toBe(-0.15);
  });

  it('emits a simulated take-profit receipt at +50%', () => {
    const receipt = evaluateShadowExit({ ...BASE, observedPrice: 150 });
    expect(receipt.decision).toBe('SHADOW_TAKE_PROFIT');
    expect(receipt.pnlPct).toBeCloseTo(0.5);
    expect(receipt.simulatedOnly).toBe(true);
    expect(receipt.liveOrderAllowed).toBe(false);
    expect(receipt.transactionSignerPresent).toBe(false);
    expect(receipt.privateKeyAccepted).toBe(false);
    expect(receipt.failureReceipts).toEqual([]);
  });

  it('emits a simulated stop-loss receipt at -15%', () => {
    const receipt = evaluateShadowExit({ ...BASE, observedPrice: 85 });
    expect(receipt.decision).toBe('SHADOW_STOP_LOSS');
    expect(receipt.pnlPct).toBeCloseTo(-0.15);
    expect(receipt.liveOrderAllowed).toBe(false);
  });

  it('holds inside the shadow band', () => {
    const receipt = evaluateShadowExit({ ...BASE, observedPrice: 120 });
    expect(receipt.decision).toBe('HOLD');
    expect(receipt.pnlPct).toBeCloseTo(0.2);
  });

  it('never collapses distinct invalid observations into one failure receipt', () => {
    const receipt = evaluateShadowExit({
      assetId: '',
      entryPrice: 0,
      observedPrice: -1,
      observedAt: 'not-a-date',
      evidenceRef: '',
    });

    expect(receipt.decision).toBe('HOLD');
    expect(receipt.failureReceipts.map((failure) => failure.id)).toEqual([
      'asset-id-missing',
      'entry-price-invalid',
      'observed-price-invalid',
      'evidence-ref-missing',
      'observed-at-invalid',
    ]);
    expect(new Set(receipt.failureReceipts.map((failure) => failure.id)).size).toBe(5);
  });

  it('changes the receipt fingerprint when market evidence changes', () => {
    const first = evaluateShadowExit({ ...BASE, observedPrice: 120 });
    const second = evaluateShadowExit({ ...BASE, observedPrice: 121 });
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });
});
