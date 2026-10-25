import { describe, expect, it } from 'vitest';
import { requireProviderEvidence } from '../operatorRelayEvidence.js';
import type { OperatorRelayResponseV1 } from '../operatorRelay.js';

describe('requireProviderEvidence', () => {
  it('rejects completed relay answers with no provider evidence', () => {
    const response = { status: 'completed', evidenceRefs: [] } as unknown as OperatorRelayResponseV1;
    expect(requireProviderEvidence(response)).toEqual([
      'completed relay response requires provider evidence',
    ]);
  });
});
