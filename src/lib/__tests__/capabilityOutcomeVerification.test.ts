import { describe, expect, it } from 'vitest';
import type { RepositoryProvider, VerificationSignal } from '../../providers/RepositoryProvider.js';
import {
  capabilityOutcomeVerificationHash,
  matchingCapabilityOutcomeVerification,
  repositoryRepairSourceRef,
  validateCapabilityOutcomeVerificationReceipt,
  verifyRepositoryRepairOutcome,
} from '../capabilityOutcomeVerification.js';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayRequestHash,
  operatorRelayResponseHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
  type OperatorRelayResponseV1,
} from '../operatorRelay.js';

const HEAD = 'a'.repeat(40);
const REPOSITORY = 'jussray/founder-control-room';

function relayRequest(
  exactSha = HEAD,
  overrides: Partial<Omit<OperatorRelayRequestV1, 'requestHash' | 'context'>> & {
    contextSummary?: string;
    sourceRef?: string;
  } = {},
): OperatorRelayRequestV1 {
  const summary = overrides.contextSummary ?? 'repair the repository';
  const sourceRef = overrides.sourceRef ?? repositoryRepairSourceRef(REPOSITORY, exactSha);
  const identity: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: overrides.relayId ?? 'relay-1',
    fromOperator: overrides.fromOperator ?? 'fcr',
    toOperator: overrides.toOperator ?? 'codex',
    capability: overrides.capability ?? 'implement',
    goal: overrides.goal ?? 'repair exact repository head',
    context: {
      summary,
      sourceRef,
      sourceFingerprint: relayContextFingerprint(summary, sourceRef),
    },
    authority: overrides.authority ?? {
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    },
    sensitivity: overrides.sensitivity ?? 'internal',
    createdAt: overrides.createdAt ?? '2026-10-06T20:00:00.000Z',
    expiresAt: overrides.expiresAt ?? '2026-10-06T21:00:00.000Z',
  };
  return { ...identity, requestHash: operatorRelayRequestHash(identity) };
}

function relayResponse(
  request: OperatorRelayRequestV1,
  overrides: Partial<Omit<OperatorRelayResponseV1, 'responseHash'>> = {},
): OperatorRelayResponseV1 {
  const identity: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: request.relayId,
    requestHash: request.requestHash,
    fromOperator: request.toOperator,
    toOperator: request.fromOperator,
    status: 'completed',
    answer: 'repair complete',
    evidenceRefs: ['provider:openai:response-1'],
    unresolved: [],
    authorityRequested: 'none',
    completedAt: '2026-10-06T20:10:00.000Z',
    ...overrides,
  };
  return { ...identity, responseHash: operatorRelayResponseHash(identity) };
}

function signal(
  name: string,
  status: VerificationSignal['status'] = 'passed',
  overrides: Partial<VerificationSignal> = {},
): VerificationSignal {
  return {
    id: overrides.id ?? String(name.length * 100 + (status === 'passed' ? 1 : 2)),
    name,
    status,
    commitSha: overrides.commitSha ?? HEAD,
    provider: 'github',
    issuer: overrides.issuer ?? { kind: 'app', id: '15368', name: 'github-actions' },
    startedAt: overrides.startedAt ?? '2026-10-06T20:00:00.000Z',
    completedAt: overrides.completedAt ?? '2026-10-06T20:05:00.000Z',
    detailsUrl: overrides.detailsUrl ?? 'https://github.com/jussray/founder-control-room/actions',
    evidenceFingerprint: overrides.evidenceFingerprint,
  };
}

function fakeProvider(signals: VerificationSignal[], exactSha = HEAD): RepositoryProvider {
  return {
    name: 'github',
    resolveRef: async () => exactSha,
    getRef: async () => ({ name: exactSha, commitSha: exactSha, committedAt: '2026-10-06T19:00:00.000Z' }),
    listVerificationSignals: async () => signals,
  } as unknown as RepositoryProvider;
}

const requiredChecks = [
  { name: 'CI', issuerId: '15368' },
  { name: 'Playwright E2E', issuerId: '15368' },
] as const;

describe('repository repair outcome verifier', () => {
  it('issues a non-authorizing verification receipt only from subject-bound exact-head provider evidence', async () => {
    const request = relayRequest();
    const response = relayResponse(request);
    const result = await verifyRepositoryRepairOutcome({
      request,
      response,
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks,
      requirePlaywright: true,
    }, {
      providerFactory: () => fakeProvider([
        signal('CI', 'passed', { id: '1001' }),
        signal('Playwright E2E', 'passed', { id: '1002' }),
      ]),
    });

    expect(result.verified).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.receipt).toMatchObject({
      taskClass: 'repository-repair',
      relayId: response.relayId,
      responseHash: response.responseHash,
      operatorId: 'codex',
      subject: {
        repository: REPOSITORY,
        exactSha: HEAD,
      },
      outcomeVerified: true,
      selectionAuthority: false,
      executionAuthority: false,
    });
    expect(result.receipt?.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.receipt && validateCapabilityOutcomeVerificationReceipt(result.receipt)).toEqual([]);
    expect(result.receipt && matchingCapabilityOutcomeVerification(
      result.receipt,
      response,
      'repository-repair',
      'codex',
    )).toBe(true);
  });

  it('refuses to pair a successful relay with a different green repository subject', async () => {
    const request = relayRequest('b'.repeat(40));
    const response = relayResponse(request);
    const result = await verifyRepositoryRepairOutcome({
      request,
      response,
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([signal('CI')]),
    });

    expect(result.verified).toBe(false);
    expect(result.evidenceReceipt).toBeNull();
    expect(result.blockers).toContain('relay request is not bound to the exact repository repair subject');
  });

  it('requires implement capability for a repository repair outcome', async () => {
    const request = relayRequest(HEAD, { capability: 'review' });
    const result = await verifyRepositoryRepairOutcome({
      request,
      response: relayResponse(request),
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, { providerFactory: () => fakeProvider([signal('CI')]) });

    expect(result.verified).toBe(false);
    expect(result.evidenceReceipt).toBeNull();
    expect(result.blockers).toContain('repository repair verification requires implement capability');
  });

  it('fails closed when a newer same-name rerun fails after an older pass', async () => {
    const request = relayRequest();
    const result = await verifyRepositoryRepairOutcome({
      request,
      response: relayResponse(request),
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([
        signal('CI', 'passed', {
          id: '100',
          startedAt: '2026-10-06T19:00:00.000Z',
          completedAt: '2026-10-06T19:05:00.000Z',
        }),
        signal('CI', 'failed', {
          id: '101',
          startedAt: '2026-10-06T20:00:00.000Z',
          completedAt: '2026-10-06T20:01:00.000Z',
        }),
      ]),
    });

    expect(result.verified).toBe(false);
    expect(result.receipt).toBeNull();
    expect(result.blockers).toContain('required exact-head check is not passed: CI=failed');
  });

  it('requires the configured provider-backed producer identity', async () => {
    const request = relayRequest();
    const result = await verifyRepositoryRepairOutcome({
      request,
      response: relayResponse(request),
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([
        signal('CI', 'passed', { issuer: { kind: 'app', id: '99999', name: 'lookalike' } }),
      ]),
    });

    expect(result.verified).toBe(false);
    expect(result.blockers).toContain('required exact-head check producer mismatch: CI');
  });

  it('refuses Playwright-required repair proof unless the policy declares a browser-shaped check', async () => {
    const request = relayRequest();
    const result = await verifyRepositoryRepairOutcome({
      request,
      response: relayResponse(request),
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
      requirePlaywright: true,
    }, {
      providerFactory: () => fakeProvider([
        signal('CI'),
        signal('Playwright E2E'),
      ]),
    });

    expect(result.verified).toBe(false);
    expect(result.blockers).toContain('Playwright-required repository repair must declare a browser-shaped required check');
  });

  it('rejects a relay outcome whose canonical response hash was tampered after completion', async () => {
    const request = relayRequest();
    const response = relayResponse(request);
    const tampered = { ...response, answer: 'different answer' };

    const result = await verifyRepositoryRepairOutcome({
      request,
      response: tampered,
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([signal('CI')]),
    });

    expect(result.verified).toBe(false);
    expect(result.blockers).toContain('relay responseHash does not match response content');
  });

  it('does not verify a response that still declares unresolved work', async () => {
    const request = relayRequest();
    const result = await verifyRepositoryRepairOutcome({
      request,
      response: relayResponse(request, { unresolved: ['needs provider readback'] }),
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([signal('CI')]),
    });

    expect(result.verified).toBe(false);
    expect(result.blockers).toContain('relay outcome still reports unresolved work');
  });

  it('returns blockers without touching the provider when the verification subject is malformed', async () => {
    let providerConstructed = false;
    const request = relayRequest();
    const result = await verifyRepositoryRepairOutcome({
      request,
      response: relayResponse(request),
      repository: 'not-a-repository',
      expectedHeadSha: 'short',
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => {
        providerConstructed = true;
        return fakeProvider([signal('CI')]);
      },
    });

    expect(result.verified).toBe(false);
    expect(result.receipt).toBeNull();
    expect(result.evidenceReceipt).toBeNull();
    expect(result.blockers).toEqual(expect.arrayContaining([
      'repository must use owner/name format',
      'expectedHeadSha must be a full commit sha',
    ]));
    expect(providerConstructed).toBe(false);
  });

  it('turns provider evidence read failure into a blocker without leaking provider error detail', async () => {
    const request = relayRequest();
    const result = await verifyRepositoryRepairOutcome({
      request,
      response: relayResponse(request),
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => ({
        name: 'github',
        getRef: async () => { throw new Error('secret provider detail'); },
        listVerificationSignals: async () => [],
      } as unknown as RepositoryProvider),
    });

    expect(result).toMatchObject({
      verified: false,
      receipt: null,
      evidenceReceipt: null,
      blockers: ['project evidence read failed'],
    });
  });

  it('binds the receipt hash so verification content cannot be rewritten after issuance', async () => {
    const request = relayRequest();
    const response = relayResponse(request);
    const result = await verifyRepositoryRepairOutcome({
      request,
      response,
      repository: REPOSITORY,
      expectedHeadSha: HEAD,
      requiredChecks: [{ name: 'CI', issuerId: '15368' }],
    }, {
      providerFactory: () => fakeProvider([signal('CI')]),
    });
    expect(result.receipt).not.toBeNull();

    const receipt = result.receipt!;
    const tampered = {
      ...receipt,
      subject: { ...receipt.subject, exactSha: 'b'.repeat(40) },
    };
    expect(validateCapabilityOutcomeVerificationReceipt(tampered)).toContain('verificationHash does not match verification content');

    const { verificationHash: _verificationHash, ...identity } = receipt;
    expect(capabilityOutcomeVerificationHash(identity)).toBe(receipt.verificationHash);
  });
});
