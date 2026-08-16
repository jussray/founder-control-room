import { describe, expect, it } from 'vitest';
import { createBuildEvent, validateBuildEvent, type BuildEventInput } from '../buildEvent.js';

const SHA = 'a'.repeat(40);

function base(overrides: Partial<BuildEventInput> = {}): BuildEventInput {
  return {
    eventId: 'github:delivery-123',
    occurredAt: '2026-08-16T04:00:00Z',
    source: 'github',
    category: 'source',
    phase: 'build',
    truth: 'verified',
    authority: 'observed',
    status: 'completed',
    repository: {
      name: 'jussray/founder-control-room',
      branch: 'main',
      commitSha: SHA,
    },
    evidenceRefs: ['github-delivery:delivery-123'],
    ...overrides,
  };
}

describe('BuildEvent contract', () => {
  it('normalizes an operational event and strips URL query/fragment data', () => {
    const event = createBuildEvent(base({
      evidenceUrls: ['https://github.com/jussray/founder-control-room/commit/' + SHA + '?token=secret#diff'],
    }));

    expect(event.contract).toBe('fcr/build-event@v1');
    expect(event.privacy).toBe('operational-only');
    expect(event.repository?.commitSha).toBe(SHA);
    expect(event.evidenceUrls).toEqual([
      'https://github.com/jussray/founder-control-room/commit/' + SHA,
    ]);
  });

  it('rejects malformed runtime dimensions even when input bypasses TypeScript', () => {
    const input = base() as unknown as Record<string, unknown>;
    input.source = 'made-up-provider';
    input.truth = 'probably';

    const errors = validateBuildEvent(input as unknown as BuildEventInput);
    expect(errors).toContain('source is invalid');
    expect(errors).toContain('truth is invalid');
  });

  it('reserves authorized authority for founder decisions', () => {
    expect(validateBuildEvent(base({ authority: 'authorized' }))).toContain(
      'authorized authority is reserved for founder decision events',
    );

    const founderDecision = createBuildEvent({
      eventId: 'founder:approval-1',
      occurredAt: '2026-08-16T04:01:00Z',
      source: 'founder',
      category: 'decision',
      phase: 'build',
      truth: 'verified',
      authority: 'authorized',
      status: 'completed',
      decision: { value: 'approved', scope: 'read-only implementation inspection' },
      evidenceRefs: ['fcr-founder-decision:approval-1'],
    });

    expect(founderDecision.decision?.value).toBe('approved');
    expect(founderDecision.authority).toBe('authorized');
  });

  it('does not allow a provider observation to smuggle a runtime witness', () => {
    const errors = validateBuildEvent(base({
      category: 'provider',
      phase: 'deploy',
      runtime: {
        service: 'sekret-backend',
        environment: 'production',
        releaseSha: SHA,
      },
    }));

    expect(errors).toContain('runtime payload requires category=runtime');
  });

  it('requires evidence for verified claims and exact SHA shape', () => {
    expect(validateBuildEvent(base({ evidenceRefs: [], evidenceUrls: [] }))).toContain(
      'verified events require at least one evidence URL or evidence reference',
    );
    expect(validateBuildEvent(base({
      repository: { name: 'jussray/founder-control-room', branch: 'main', commitSha: 'abc' },
    }))).toContain('repository.commitSha must be an exact 40-character SHA');
  });
});
