import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_ENVELOPE_CONTRACT,
  CAPABILITY_IDENTITY_CONTRACT,
  authorityEnvelopeHash,
  capabilityIdentity,
  validateAuthorityEnvelope,
  type AuthorityEnvelopeV1,
} from '../authorityKernel.js';

const HASH = 'a'.repeat(64);

function envelope(overrides: Partial<AuthorityEnvelopeV1> = {}): AuthorityEnvelopeV1 {
  const base: Omit<AuthorityEnvelopeV1, 'envelopeHash'> = {
    contract: AUTHORITY_ENVELOPE_CONTRACT,
    intentId: 'intent-1',
    actor: 'founder',
    capability: capabilityIdentity('github.issue.create'),
    authorityScope: 'repo:jussray/founder-control-room',
    proposalHash: HASH,
    argumentsHash: 'b'.repeat(64),
    stateFingerprint: 'c'.repeat(64),
    consequenceClass: 'consequential',
    toolCallId: 'call-1',
    issuedAt: '2026-09-11T07:00:00.000Z',
    expiresAt: '2026-09-11T07:10:00.000Z',
    approvedBy: 'founder',
    idempotencyKey: 'intent-1:call-1',
  };
  const merged = { ...base, ...overrides } as Omit<AuthorityEnvelopeV1, 'envelopeHash'>;
  return { ...merged, envelopeHash: authorityEnvelopeHash(merged) };
}

const context = {
  now: '2026-09-11T07:05:00.000Z',
  capabilityId: 'github.issue.create',
  proposalHash: HASH,
  argumentsHash: 'b'.repeat(64),
  stateFingerprint: 'c'.repeat(64),
  toolCallId: 'call-1',
};

describe('FCR authority kernel', () => {
  it('requires canonical provider.domain.action capability identities', () => {
    expect(capabilityIdentity(' GitHub.Issue.Create ')).toEqual({
      contract: CAPABILITY_IDENTITY_CONTRACT,
      id: 'github.issue.create',
    });
    expect(capabilityIdentity('github.repository.create_branch')).toEqual({
      contract: CAPABILITY_IDENTITY_CONTRACT,
      id: 'github.repository.create_branch',
    });
    expect(() => capabilityIdentity('create_issue')).toThrow(/provider\.domain\.action/);
  });

  it('accepts a fresh approval bound to exact capability, proposal, args, state, and tool call', () => {
    expect(validateAuthorityEnvelope(envelope(), context)).toEqual([]);
  });

  it('invalidates stale approvals when state or arguments change', () => {
    const changed = { ...context, argumentsHash: 'd'.repeat(64), stateFingerprint: 'e'.repeat(64) };
    expect(validateAuthorityEnvelope(envelope(), changed)).toEqual(expect.arrayContaining([
      'tool arguments changed after approval',
      'execution state changed after approval',
    ]));
  });

  it('rejects expired approval and replay against another tool call', () => {
    expect(validateAuthorityEnvelope(envelope(), {
      ...context,
      now: '2026-09-11T07:11:00.000Z',
      toolCallId: 'call-2',
    })).toEqual(expect.arrayContaining([
      'authority envelope is expired',
      'tool call changed after approval',
    ]));
  });

  it('detects post-approval envelope tampering', () => {
    const approved = envelope();
    expect(validateAuthorityEnvelope({ ...approved, authorityScope: 'repo:other/repo' }, context))
      .toContain('authority envelope hash does not match content');
  });
});
