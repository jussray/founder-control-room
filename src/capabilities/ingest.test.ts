import { describe, expect, it } from 'vitest';
import { validateExternalContract, type ExternalCapabilityContract } from './ingest.js';

const sha = 'a'.repeat(40);

function contract(): ExternalCapabilityContract {
  return {
    schema_version: '1.0',
    repository: 'jussray/l99-StoryEngine',
    blockers: [],
    health: { overall: 'yellow' },
    capabilities: [
      { id: 'TEST', status: 'verified', evidence_ids: ['run-1'] },
    ],
    proof: [
      {
        id: 'run-1',
        status: 'verified',
        source: 'https://github.com/jussray/l99-StoryEngine/actions/runs/123456',
        commit_sha: sha,
        scope: ['TEST'],
        verified_at: '2026-07-25T20:00:00Z',
      },
    ],
  };
}

const source = {
  repository: 'jussray/l99-StoryEngine',
  commitSha: sha,
  fetchedAt: new Date('2026-07-25T21:00:00Z'),
  maxEvidenceAgeMs: 24 * 60 * 60 * 1000,
};

describe('validateExternalContract', () => {
  it('accepts exact-head immutable evidence within freshness policy', () => {
    expect(validateExternalContract(contract(), source)).toEqual([]);
  });

  it('rejects repository identity confusion', () => {
    const value = contract();
    value.repository = 'attacker/fake-repo';
    expect(validateExternalContract(value, source)).toContain('repository identity mismatch');
  });

  it('rejects cross-commit evidence', () => {
    const value = contract();
    value.proof[0].commit_sha = 'b'.repeat(40);
    expect(validateExternalContract(value, source)).toContain('proof run-1 is not bound to exact head');
  });

  it('rejects scope inflation', () => {
    const value = contract();
    value.proof[0].scope = ['BUILD'];
    expect(validateExternalContract(value, source)).toContain('TEST is outside proof run-1 scope');
  });

  it('rejects stale evidence', () => {
    const value = contract();
    value.proof[0].verified_at = '2026-07-20T20:00:00Z';
    expect(validateExternalContract(value, source)).toContain('proof run-1 is stale');
  });

  it('rejects green health with blockers', () => {
    const value = contract();
    value.health.overall = 'green';
    value.blockers = ['Authorization is not proven'];
    expect(validateExternalContract(value, source)).toContain('overall health cannot be green while blockers exist');
  });
});
