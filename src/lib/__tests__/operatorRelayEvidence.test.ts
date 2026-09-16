import { describe, expect, it } from 'vitest';
import { requireProviderEvidence } from '../operatorRelayEvidence.js';
import type { OperatorRelayResponseV1 } from '../operatorRelay.js';

describe('requireProviderEvidence', () => {
  it('rejects completed relay answers with no provider evidence', () => {
    expect(requireProviderEvidence({ status: 'completed', evidenceRefs: [] } as OperatorRelayResponseV1)).toEqual([
      'completed relay response requires provider evidence',
    ]);
  });
});
