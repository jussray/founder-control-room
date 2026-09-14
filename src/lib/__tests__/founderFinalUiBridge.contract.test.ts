import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bridgeSource = readFileSync(
  new URL('../../../public/control-room/v10-plan-bridge.js', import.meta.url),
  'utf8',
);

describe('Founder Final browser bridge contract', () => {
  it('binds merge proof-gate requests to explicit exact-candidate Founder Final metadata', () => {
    expect(bridgeSource).toContain("const proofGatePath = /^\\/approvals\\/([^/]+)\\/run-proof-gate$/;");
    expect(bridgeSource).toContain("body?.gateId === 'merge'");
    expect(bridgeSource).toContain("readFounderFinalReview(document.querySelector('#proof-gate-form'))");
    expect(bridgeSource).toContain('confirmExactCandidate: true');
  });

  it('binds merge execution payloads to the same server-validated Founder Final shape', () => {
    expect(bridgeSource).toContain('payload.founderFinalReview');
    expect(bridgeSource).toContain("readFounderFinalReview(formForAction('merge'))");
    expect(bridgeSource).toContain('payload: { ...payload, founderFinalReview }');
  });

  it('requires an explicit confirmation control and does not persist approval in localStorage', () => {
    expect(bridgeSource).toContain('name="founderFinalPullRequestNumber"');
    expect(bridgeSource).toContain('name="founderFinalConfirmExactCandidate"');
    expect(bridgeSource).toContain('I confirm this exact PR/base/head candidate.');
    expect(bridgeSource).not.toContain('localStorage');
  });
});
