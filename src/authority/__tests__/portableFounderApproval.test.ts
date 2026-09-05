import { describe, expect, it, vi } from 'vitest';

import {
  PORTABLE_FOUNDER_APPROVAL_VERSION,
  REGISTERED_ADAPTER_ATTESTATION_TYPE,
  type PortableFounderApprovalPacket,
  type PortableFounderApprovalUnsignedPacket,
  type RegisteredPortableApprovalAdapterVerifier,
  validatePortableFounderApprovalPacket,
} from '../portableFounderApproval.js';

const HEAD_SHA = 'a'.repeat(40);
const CONTENT_HASH = `sha256:${'b'.repeat(64)}`;
const CHECKED_AT = '2026-09-05T22:00:00.000Z';

function packet(overrides: Partial<PortableFounderApprovalPacket> = {}): PortableFounderApprovalPacket {
  return {
    version: PORTABLE_FOUNDER_APPROVAL_VERSION,
    decisionId: 'fap_test_001',
    founderId: 'founder-user-uuid',
    decision: 'approve',
    sourceConsole: 'chatgpt',
    sourceConversationRef: 'chatgpt:conversation:test:message:1',
    sourceAdapterRef: 'chatgpt-adapter@v1',
    scope: {
      action: 'merge',
      target: 'jussray/founder-control-room',
      branch: 'codex/provider-neutral-founder-content-contracts',
      expectedCommitSha: HEAD_SHA,
      contentHash: CONTENT_HASH,
      missionId: null,
      commandId: null,
      environment: 'repository-only',
    },
    constraints: [
      'required checks must pass on expectedCommitSha',
      'no deployment',
    ],
    issuedAt: '2026-09-05T21:55:00.000Z',
    expiresAt: '2026-09-05T22:15:00.000Z',
    oneTime: true,
    founderNote: 'Approved after exact-head review.',
    attestation: {
      type: REGISTERED_ADAPTER_ATTESTATION_TYPE,
      keyId: 'chatgpt-adapter-key-v1',
      signature: 'signed-test-packet',
    },
    ...overrides,
  };
}

function context(options: {
  registered?: boolean;
  founderAllowed?: boolean;
  resolveThrows?: boolean;
  verify?: (packet: PortableFounderApprovalUnsignedPacket, signature: string) => boolean | Promise<boolean>;
} = {}) {
  const verify = vi.fn(async ({
    packet: unsigned,
    signature,
  }: {
    packet: PortableFounderApprovalUnsignedPacket;
    signature: string;
  }) => (options.verify ? options.verify(unsigned, signature) : signature === 'signed-test-packet'));

  const adapter: RegisteredPortableApprovalAdapterVerifier = {
    sourceConsole: 'chatgpt',
    sourceAdapterRef: 'chatgpt-adapter@v1',
    keyId: 'chatgpt-adapter-key-v1',
    verify,
  };

  return {
    checkedAt: CHECKED_AT,
    isFounderAllowed: vi.fn(async () => options.founderAllowed ?? true),
    resolveAdapter: vi.fn(async () => {
      if (options.resolveThrows) throw new Error('registry unavailable');
      return options.registered === false ? null : adapter;
    }),
    verify,
  };
}

describe('portable founder approval packet validation', () => {
  it('validates an exact registered adapter packet without granting execution authority', async () => {
    const deps = context();
    const result = await validatePortableFounderApprovalPacket(packet(), deps);

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      executionAuthorized: false,
      consumptionRequired: true,
    }));
    expect(deps.verify).toHaveBeenCalledTimes(1);
    expect(deps.verify.mock.calls[0]?.[0].packet.attestation).toEqual({
      type: REGISTERED_ADAPTER_ATTESTATION_TYPE,
      keyId: 'chatgpt-adapter-key-v1',
    });
    expect(deps.verify.mock.calls[0]?.[0].packet).not.toHaveProperty('attestation.signature');
  });

  it('snapshots and freezes the attested identity before returning a validated result', async () => {
    const original = packet();
    const result = await validatePortableFounderApprovalPacket(original, context());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected portable approval to validate');

    const mutableOriginal = original as unknown as {
      scope: { target: string };
      constraints: string[];
    };
    mutableOriginal.scope.target = 'jussray/tampered-after-validation';
    mutableOriginal.constraints.push('silently expanded authority');

    expect(result.packet.scope.target).toBe('jussray/founder-control-room');
    expect(result.packet.constraints).not.toContain('silently expanded authority');
    expect(Object.isFrozen(result.packet)).toBe(true);
    expect(Object.isFrozen(result.packet.scope)).toBe(true);
    expect(Object.isFrozen(result.packet.constraints)).toBe(true);
    expect(Object.isFrozen(result.packet.attestation)).toBe(true);
  });

  it('rejects a packet when the exact console adapter tuple is not registered', async () => {
    const result = await validatePortableFounderApprovalPacket(packet(), context({ registered: false }));

    expect(result).toEqual({
      ok: false,
      code: 'ADAPTER_NOT_REGISTERED',
      reason: 'exact source console, adapter version, and attestation key are not registered',
    });
  });

  it('fails closed when the adapter registry cannot resolve safely', async () => {
    const result = await validatePortableFounderApprovalPacket(packet(), context({ resolveThrows: true }));

    expect(result).toEqual({
      ok: false,
      code: 'ADAPTER_NOT_REGISTERED',
      reason: 'exact source console, adapter version, and attestation key are not registered',
    });
  });

  it('rejects a packet when founder identity is not allowlisted', async () => {
    const deps = context({ founderAllowed: false });
    const result = await validatePortableFounderApprovalPacket(packet(), deps);

    expect(result).toEqual({
      ok: false,
      code: 'FOUNDER_NOT_ALLOWED',
      reason: 'founder identity is not allowlisted',
    });
    expect(deps.verify).toHaveBeenCalledTimes(1);
  });

  it('rejects tampering when the registered adapter verifier does not attest the changed scope', async () => {
    const expectedTarget = 'jussray/founder-control-room';
    const deps = context({
      verify: (unsigned, signature) => signature === 'signed-test-packet'
        && unsigned.scope.target === expectedTarget
        && unsigned.scope.expectedCommitSha === HEAD_SHA,
    });
    const tampered = packet({
      scope: {
        ...packet().scope,
        target: 'jussray/other-repository',
      },
    });

    const result = await validatePortableFounderApprovalPacket(tampered, deps);

    expect(result).toEqual({
      ok: false,
      code: 'ATTESTATION_INVALID',
      reason: 'registered adapter attestation could not be verified',
    });
  });

  it('fails closed when the registered adapter verifier throws', async () => {
    const deps = context({
      verify: () => {
        throw new Error('verification backend unavailable');
      },
    });

    const result = await validatePortableFounderApprovalPacket(packet(), deps);

    expect(result).toEqual({
      ok: false,
      code: 'ATTESTATION_INVALID',
      reason: 'registered adapter attestation could not be verified',
    });
  });

  it('rejects expired decisions before adapter verification', async () => {
    const deps = context();
    const result = await validatePortableFounderApprovalPacket(packet({
      issuedAt: '2026-09-05T21:00:00.000Z',
      expiresAt: '2026-09-05T21:20:00.000Z',
    }), deps);

    expect(result).toEqual({
      ok: false,
      code: 'DECISION_NOT_CURRENT',
      reason: 'portable founder approval is not current at validation time',
    });
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it('requires merge approval to carry an exact branch and head SHA', async () => {
    const result = await validatePortableFounderApprovalPacket(packet({
      scope: {
        ...packet().scope,
        expectedCommitSha: undefined,
      },
    }), context());

    expect(result).toEqual({
      ok: false,
      code: 'PACKET_INVALID',
      reason: 'merge requires an exact branch and expectedCommitSha',
    });
  });

  it('rejects noncanonical action spellings before they can bypass action-specific scope rules', async () => {
    const deps = context();
    const result = await validatePortableFounderApprovalPacket(packet({
      scope: {
        ...packet().scope,
        action: 'merge ',
        branch: undefined,
        expectedCommitSha: undefined,
      },
    }), deps);

    expect(result).toEqual({
      ok: false,
      code: 'PACKET_INVALID',
      reason: 'scope.action must use canonical lowercase action syntax',
    });
    expect(deps.resolveAdapter).not.toHaveBeenCalled();
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it('accepts an authenticated deny decision while preserving zero execution authority', async () => {
    const result = await validatePortableFounderApprovalPacket(packet({ decision: 'deny' }), context());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      executionAuthorized: false,
      consumptionRequired: true,
      packet: expect.objectContaining({ decision: 'deny' }),
    }));
  });

  it('fails closed on unknown fields instead of silently ignoring future authority claims', async () => {
    const withUnknownAuthority = {
      ...packet(),
      executionAuthorized: true,
    };

    const result = await validatePortableFounderApprovalPacket(withUnknownAuthority, context());

    expect(result).toEqual({
      ok: false,
      code: 'PACKET_INVALID',
      reason: 'portable founder approval packet contains unknown top-level fields',
    });
  });
});
