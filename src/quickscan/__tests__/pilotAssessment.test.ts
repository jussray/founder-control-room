import { describe, expect, it } from 'vitest';
import { assessQuickScanSandboxPilot } from '../pilotAssessment.js';

const executionId = 'sandbox_execution_001';
const artifactDigest = 'a'.repeat(64);
const input = () => ({ mode: 'sandbox', authorized: true, executionId, delivery: { executionId, status: 'completed', artifactDigest } });

describe('QuickScan non-chargeable pilot assessment', () => {
  it('never accepts caller authorization without a server-authenticated founder', () => {
    expect(assessQuickScanSandboxPilot(false, input()).allowed).toBe(false);
  });
  it('marks caller delivery as unverified even for authenticated founder', () => {
    const result = assessQuickScanSandboxPilot(true, input());
    expect(result.allowed).toBe(true);
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error('expected allowed sandbox assessment');
    expect(result.receipt.deliveryVerified).toBe(false);
    expect(result.receipt.independentlyVerified).toBe(false);
  });
  it('cannot be used to request payment or production authority', () => {
    expect(assessQuickScanSandboxPilot(true, { ...input(), chargeRequested: true }).allowed).toBe(false);
    expect(assessQuickScanSandboxPilot(true, { ...input(), mode: 'production' }).allowed).toBe(false);
  });
});
