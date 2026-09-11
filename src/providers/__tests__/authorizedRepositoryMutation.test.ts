import { describe, expect, it, vi } from 'vitest';
import type { RepositoryProvider } from '../RepositoryProvider.js';
import { executeAuthorizedCreateBranch } from '../authorizedRepositoryMutation.js';
import {
  AUTHORITY_ENVELOPE_CONTRACT,
  authorityEnvelopeHash,
  capabilityIdentity,
  type AuthorityEnvelopeV1,
} from '../../founder-os-lab/authorityKernel.js';

const sha = (char: string) => char.repeat(64);

function envelope(overrides: Partial<AuthorityEnvelopeV1> = {}): AuthorityEnvelopeV1 {
  const unsigned: Omit<AuthorityEnvelopeV1, 'envelopeHash'> = {
    contract: AUTHORITY_ENVELOPE_CONTRACT,
    intentId: 'mission-123',
    actor: 'founder@example.com',
    capability: capabilityIdentity('github.repository.create_branch'),
    authorityScope: 'project:founder-control-room:branch:create',
    proposalHash: sha('a'),
    argumentsHash: sha('b'),
    stateFingerprint: sha('c'),
    consequenceClass: 'reversible',
    toolCallId: 'tool-call-123',
    issuedAt: '2026-09-11T07:20:00.000Z',
    expiresAt: '2026-09-11T07:35:00.000Z',
    approvedBy: 'founder@example.com',
    idempotencyKey: 'idem-123',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'envelopeHash')),
  } as Omit<AuthorityEnvelopeV1, 'envelopeHash'>;
  const complete = { ...unsigned, envelopeHash: authorityEnvelopeHash(unsigned) };
  return overrides.envelopeHash ? { ...complete, envelopeHash: overrides.envelopeHash } : complete;
}

function provider(createBranch = vi.fn(async () => 'mission/123')): RepositoryProvider {
  return { createBranch } as unknown as RepositoryProvider;
}

const context = {
  now: '2026-09-11T07:25:00.000Z',
  proposalHash: sha('a'),
  argumentsHash: sha('b'),
  stateFingerprint: sha('c'),
  toolCallId: 'tool-call-123',
};

describe('executeAuthorizedCreateBranch', () => {
  it('executes exactly once when the approved envelope still matches', async () => {
    const createBranch = vi.fn(async () => 'mission/123');
    const result = await executeAuthorizedCreateBranch(provider(createBranch), {
      projectId: 'founder-control-room',
      baseRef: 'main',
      branchName: 'mission/123',
      envelope: envelope(),
      context,
    });

    expect(result).toBe('mission/123');
    expect(createBranch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['expired approval', envelope({ expiresAt: '2026-09-11T07:24:59.000Z' }), context],
    ['changed arguments', envelope(), { ...context, argumentsHash: sha('d') }],
    ['changed state', envelope(), { ...context, stateFingerprint: sha('e') }],
    ['changed tool call', envelope(), { ...context, toolCallId: 'tool-call-other' }],
  ])('blocks %s before the provider mutation', async (_name, authority, changedContext) => {
    const createBranch = vi.fn(async () => 'mission/123');

    await expect(executeAuthorizedCreateBranch(provider(createBranch), {
      projectId: 'founder-control-room',
      baseRef: 'main',
      branchName: 'mission/123',
      envelope: authority,
      context: changedContext,
    })).rejects.toThrow('AUTHORITY_ENVELOPE_REJECTED');

    expect(createBranch).not.toHaveBeenCalled();
  });
});
