import { describe, expect, it, vi } from 'vitest';
import { AUTHORITY_ENVELOPE_CONTRACT, authorityEnvelopeHash, capabilityIdentity, type AuthorityEnvelopeV1 } from '../../founder-os-lab/authorityKernel.js';
import { browserActionContext, executeAuthorizedBrowserAction, type BrowserActionPlan, type BrowserActionObservation } from '../authorizedBrowserAction.js';

const now = '2026-11-28T19:00:00.000Z';
const plan: BrowserActionPlan = {
  intentId: 'fixture-intent', actor: 'fixture-founder', actionId: 'fixture.confirm',
  providerId: 'fixture', subjectRef: 'fixture:record:1', idempotencyKey: 'fixture-once',
  toolCallId: 'fixture-call', expectedOutcomeFingerprint: 'd'.repeat(64),
};
const before: BrowserActionObservation = {
  providerId: 'fixture', subjectRef: 'fixture:record:1', sessionFingerprint: 'a'.repeat(64),
  stateFingerprint: 'b'.repeat(64), authenticated: true, mutationSupported: true, observedAt: now,
};
function setup() {
  const context = browserActionContext(plan, before, now);
  const unsigned: Omit<AuthorityEnvelopeV1,'envelopeHash'> = {
    contract: AUTHORITY_ENVELOPE_CONTRACT, intentId: plan.intentId, actor: plan.actor,
    capability: capabilityIdentity(context.capabilityId), authorityScope: context.authorityScope,
    proposalHash: context.proposalHash, argumentsHash: context.argumentsHash,
    stateFingerprint: context.stateFingerprint, consequenceClass: 'consequential',
    toolCallId: plan.toolCallId, issuedAt: now, expiresAt: '2026-11-28T19:02:00.000Z',
    approvedBy: 'fixture-founder', idempotencyKey: plan.idempotencyKey,
  };
  const envelope = { ...unsigned, envelopeHash: authorityEnvelopeHash(unsigned) };
  const deps = {
    now: () => now,
    resolveApproved: vi.fn(async () => ({plan, envelope})),
    observe: vi.fn(async () => before),
    reserve: vi.fn(async () => true),
    perform: vi.fn(async () => undefined),
    verify: vi.fn(async () => ({...before, stateFingerprint: plan.expectedOutcomeFingerprint})),
    persist: vi.fn(async () => true),
  };
  return {deps, envelope};
}
const request = {intentId: plan.intentId, actor: plan.actor, idempotencyKey: plan.idempotencyKey};

describe('authorized browser action boundary', () => {
  it('requires trusted exact approval rather than a caller-supplied envelope', async () => {
    const {deps} = setup();
    deps.resolveApproved.mockRejectedValueOnce(new Error('approval missing'));
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('held');
    expect(deps.perform).not.toHaveBeenCalled();
  });
  it('fails closed for an unsupported or unauthenticated browser', async () => {
    const {deps} = setup();
    deps.observe.mockResolvedValueOnce({...before, mutationSupported:false});
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('held');
    expect(deps.reserve).not.toHaveBeenCalled();
  });
  it('requires a durable single-use reservation', async () => {
    const {deps} = setup();
    deps.reserve.mockResolvedValueOnce(false);
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('held');
    expect(deps.perform).not.toHaveBeenCalled();
  });
  it('blocks session drift after reservation', async () => {
    const {deps} = setup();
    deps.observe.mockResolvedValueOnce(before).mockResolvedValueOnce({...before,sessionFingerprint:'e'.repeat(64)});
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('held');
    expect(deps.perform).not.toHaveBeenCalled();
  });
  it('blocks approval revocation after reservation', async () => {
    const {deps} = setup();
    deps.resolveApproved.mockResolvedValueOnce({plan,envelope:setup().envelope}).mockRejectedValueOnce(new Error('revoked'));
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('held');
    expect(deps.perform).not.toHaveBeenCalled();
  });
  it('does not retry an uncertain provider mutation', async () => {
    const {deps} = setup();
    deps.perform.mockRejectedValueOnce(new Error('timeout'));
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('unverified');
    expect(deps.perform).toHaveBeenCalledTimes(1);
    expect(deps.persist).toHaveBeenCalledTimes(1);
  });
  it('does not call provider acceptance verified without independent outcome readback', async () => {
    const {deps} = setup();
    deps.verify.mockResolvedValueOnce(before);
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('unverified');
    expect(deps.perform).toHaveBeenCalledTimes(1);
  });
  it('does not claim verified if receipt storage fails', async () => {
    const {deps} = setup();
    deps.persist.mockResolvedValueOnce(false);
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('unverified');
  });
  it('returns verified only after exact postcondition and durable receipt', async () => {
    const {deps} = setup();
    expect((await executeAuthorizedBrowserAction(request, deps)).status).toBe('verified');
    expect(deps.perform).toHaveBeenCalledTimes(1);
    expect(deps.persist).toHaveBeenCalledTimes(1);
  });
});
