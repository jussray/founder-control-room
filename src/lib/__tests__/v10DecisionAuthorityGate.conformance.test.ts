import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  evaluateV10DecisionAuthorityGate,
  v10DecisionReceiptHash,
  type V10DecisionReceipt,
} from '../v10DecisionAuthorityGate.js';

const EXPECTED_HASH = '44912cf24230209d5f8f64cab39cfb424ea2178091d3b3c7462abd607d65c7a2';
const fixture = JSON.parse(
  readFileSync(new URL('../../../testdata/v10-decision-cycle-conformance.json', import.meta.url), 'utf8'),
) as V10DecisionReceipt;

describe('V10 cross-repo decision conformance', () => {
  it('independently rederives and accepts the canonical Chief/PromptOS identity for authority resolution only', () => {
    expect(v10DecisionReceiptHash(fixture)).toBe(EXPECTED_HASH);
    expect(fixture.decisionHash).toBe(EXPECTED_HASH);

    const result = evaluateV10DecisionAuthorityGate({
      decisionReceipt: fixture,
      promptOSDecisionHash: EXPECTED_HASH,
      expectedProjectSlug: fixture.projectSlug,
      currentHeadSha: fixture.expectedHeadSha,
      requireExactHead: true,
      founderApproved: true,
    });

    expect(result.validDecisionReceipt).toBe(true);
    expect(result.promptOSBindingValid).toBe(true);
    expect(result.acceptedForAuthorityResolution).toBe(true);
    expect(result.decisionHash).toBe(EXPECTED_HASH);
    expect(result.executionAuthorized).toBe(false);
    expect(result.errors).toEqual([]);
  });
});
