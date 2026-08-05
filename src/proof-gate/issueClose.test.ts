import { describe, expect, it } from 'vitest';
import { runProofGate } from './gate.js';
import type { ProofEvidence } from './types.js';

function closureEvidence(overrides: Partial<ProofEvidence> = {}): ProofEvidence {
  return {
    filesChanged: ['src/example.ts'],
    behaviorChanged: 'The tracked defect is resolved.',
    checksRun: ['npm test'],
    failures: [],
    securityImpact: 'No security boundary changed.',
    deploymentImpact: 'No deployment performed.',
    rollbackPath: 'Revert the repair and reopen the issue.',
    unresolvedRisks: [],
    issueReference: 'jussray/example#42',
    resolution: 'The issue acceptance criteria are complete.',
    nextGate: 'none',
    ...overrides,
  };
}

describe('close-issue proof gate', () => {
  it('requires explicit founder approval', () => {
    const result = runProofGate('close-issue', closureEvidence());

    expect(result.status).toBe('fail');
    expect(result.allFailures.join(' ')).toContain('requires explicit founder approval');
  });

  it('passes complete founder-approved closure evidence', () => {
    const result = runProofGate('close-issue', closureEvidence(), 'jussray');

    expect(result.status).toBe('pass');
    expect(result.allFailures).toEqual([]);
  });

  it('fails closed when issue identity, resolution, or next gate is missing', () => {
    const result = runProofGate(
      'close-issue',
      closureEvidence({ issueReference: '', resolution: '', nextGate: '' }),
      'jussray',
    );

    expect(result.status).toBe('fail');
    expect(result.allFailures.join(' ')).toContain('Issue reference is missing');
    expect(result.allFailures.join(' ')).toContain('Resolution is missing');
    expect(result.allFailures.join(' ')).toContain('Next gate is missing');
  });

  it('does not allow founder acknowledgement to erase unresolved risk', () => {
    const result = runProofGate(
      'close-issue',
      closureEvidence({ unresolvedRisks: ['Production proof is still missing.'] }),
      'jussray',
    );

    expect(result.status).toBe('fail');
    expect(result.allFailures.join(' ')).toContain('cannot be closed');
  });
});
