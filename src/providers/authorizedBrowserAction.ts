import { createHash } from 'node:crypto';
import { validateAuthorityEnvelope, type AuthorityEnvelopeV1 } from '../founder-os-lab/authorityKernel.js';

const capabilityId = 'fcr.browser.execute_action';
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fingerprint = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);
const opaque = (value: string): boolean => /^[a-zA-Z0-9._:-]{1,160}$/.test(value);

export interface BrowserActionPlan {
  intentId: string;
  actor: string;
  actionId: string;
  providerId: string;
  subjectRef: string;
  idempotencyKey: string;
  toolCallId: string;
  expectedOutcomeFingerprint: string;
}
export interface BrowserActionObservation {
  providerId: string;
  subjectRef: string;
  sessionFingerprint: string;
  stateFingerprint: string;
  authenticated: boolean;
  mutationSupported: boolean;
  observedAt: string;
}
interface BrowserActionRequest { intentId: string; actor: string; idempotencyKey: string }
interface ApprovedAction { plan: BrowserActionPlan; envelope: AuthorityEnvelopeV1 }
interface BrowserActionReceipt {
  envelopeHash: string;
  outcome: 'verified' | 'unverified';
  beforeFingerprint: string;
  afterFingerprint: string | null;
}
interface BrowserActionResult { status: 'held' | 'unverified' | 'verified'; reason: string }
export interface BrowserActionDependencies {
  now(): string;
  // Server-owned approval lookup: must authenticate the actor and resolve an
  // existing exact founder decision. A caller-provided envelope is not authority.
  resolveApproved(request: BrowserActionRequest): Promise<ApprovedAction>;
  observe(plan: BrowserActionPlan): Promise<BrowserActionObservation>;
  // Atomic durable reservation; a consumed or ambiguous attempt is never replayed.
  reserve(idempotencyKey: string, envelopeHash: string): Promise<boolean>;
  // Only a registered, server-owned driver may implement this port. It must
  // recheck the bound provider, subject, session and state at the action boundary.
  // No caller-controlled selector, URL, script, credentials or browser context.
  perform(plan: BrowserActionPlan, precondition: BrowserActionObservation): Promise<void>;
  // Independent provider readback, not the action's own response.
  verify(plan: BrowserActionPlan): Promise<BrowserActionObservation>;
  persist(idempotencyKey: string, receipt: BrowserActionReceipt): Promise<boolean>;
}

export function browserActionContext(plan: BrowserActionPlan, observation: BrowserActionObservation, now: string) {
  if (![plan.intentId, plan.actor, plan.actionId, plan.providerId, plan.subjectRef, plan.idempotencyKey, plan.toolCallId].every(opaque)
      || !fingerprint(plan.expectedOutcomeFingerprint)) throw new Error('INVALID_BROWSER_PLAN');
  const age = Date.parse(now) - Date.parse(observation.observedAt);
  if (observation.providerId !== plan.providerId || observation.subjectRef !== plan.subjectRef
      || observation.authenticated !== true || observation.mutationSupported !== true
      || !fingerprint(observation.sessionFingerprint) || !fingerprint(observation.stateFingerprint)
      || !Number.isFinite(age) || age < 0 || age > 60_000) throw new Error('INVALID_BROWSER_OBSERVATION');
  return {
    now, capabilityId,
    authorityScope: 'browser:' + plan.providerId + ':' + plan.subjectRef + ':' + plan.actionId,
    proposalHash: hash([plan.intentId, plan.actor, plan.providerId, plan.subjectRef, plan.actionId, plan.expectedOutcomeFingerprint]),
    argumentsHash: hash([plan.providerId, plan.subjectRef, plan.actionId, plan.expectedOutcomeFingerprint]),
    stateFingerprint: hash([observation.providerId, observation.subjectRef, observation.sessionFingerprint, observation.stateFingerprint]),
    toolCallId: plan.toolCallId,
  };
}
function check(request: BrowserActionRequest, approved: ApprovedAction, observation: BrowserActionObservation, now: string): void {
  const {plan, envelope} = approved;
  const context = browserActionContext(plan, observation, now);
  if (plan.intentId !== request.intentId || plan.actor !== request.actor || plan.idempotencyKey !== request.idempotencyKey
      || envelope.intentId !== plan.intentId || envelope.actor !== plan.actor
      || envelope.idempotencyKey !== plan.idempotencyKey || envelope.authorityScope !== context.authorityScope
      || envelope.consequenceClass !== 'consequential'
      || validateAuthorityEnvelope(envelope, context).length !== 0
      || observation.stateFingerprint === plan.expectedOutcomeFingerprint) throw new Error('BROWSER_AUTHORITY_HELD');
}

/** Unmounted server-side boundary. No provider driver or approval issuer is
 * registered by this module. It does not create authority or expose an API. */
export async function executeAuthorizedBrowserAction(
  request: BrowserActionRequest, deps: BrowserActionDependencies,
): Promise<BrowserActionResult> {
  const held = (reason: string): BrowserActionResult => ({status:'held',reason});
  let approved: ApprovedAction;
  let before: BrowserActionObservation;
  try {
    approved = await deps.resolveApproved(request);
    before = await deps.observe(approved.plan);
    check(request, approved, before, deps.now());
    if (!await deps.reserve(request.idempotencyKey, approved.envelope.envelopeHash)) return held('RESERVATION_UNAVAILABLE');
    const latest = await deps.resolveApproved(request);
    const current = await deps.observe(latest.plan);
    if (latest.envelope.envelopeHash !== approved.envelope.envelopeHash) return held('APPROVAL_CHANGED_AFTER_RESERVATION');
    check(request, latest, current, deps.now());
    approved = latest;
    before = current;
  } catch { return held('BROWSER_PRECONDITION_UNVERIFIED'); }
  let outcome: BrowserActionReceipt['outcome'] = 'unverified';
  let afterFingerprint: string | null = null;
  try {
    const startedAt = Date.parse(deps.now());
    await deps.perform(approved.plan, before);
    const after = await deps.verify(approved.plan);
    browserActionContext(approved.plan, after, deps.now());
    if (after.sessionFingerprint === before.sessionFingerprint &&
        Date.parse(after.observedAt) >= startedAt &&
        after.stateFingerprint === approved.plan.expectedOutcomeFingerprint) {
      outcome = 'verified';
      afterFingerprint = after.stateFingerprint;
    }
  } catch { /* uncertain provider effect; never retry automatically */ }
  try {
    if (!await deps.persist(request.idempotencyKey, {
      envelopeHash: approved.envelope.envelopeHash,
      outcome, beforeFingerprint: before.stateFingerprint, afterFingerprint,
    })) return {status:'unverified',reason:'RECEIPT_NOT_DURABLE'};
  } catch { return {status:'unverified',reason:'RECEIPT_NOT_DURABLE'}; }
  return outcome === 'verified'
    ? {status:'verified',reason:'EXACT_OUTCOME_READ_BACK'}
    : {status:'unverified',reason:'RECONCILE_PROVIDER_STATE_BEFORE_RETRY'};
}
