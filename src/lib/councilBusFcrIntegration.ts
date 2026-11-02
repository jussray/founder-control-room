/**
 * Optional FCR ↔ Council Bus integration boundary. No network, credentials or
 * authority are provided here. Only the authenticated owning runtime may
 * inject an independently verified embedded Council Bus adapter.
 */
export interface FcrFounderSession { userId: string; email: string }
export interface FcrCouncilRoundReadback {
  mission_id: string | null;
  round: number;
  transcript: {
    state: 'complete' | 'interrupted';
    goal: string;
    sourceRef: string;
    hops: Array<{ toOperator: string; answer: string; evidenceRefs: string[] }>;
  };
}
export interface PortableCouncilReturnBundle {
  council: {
    goal: string; sourceRef: string; fingerprint: string;
    findings: Array<{ id: string; finding: string; evidenceRefs: string[] }>;
  };
  court: { verdict: string; fingerprint: string; councilFingerprint: string };
  handoff: {
    councilFingerprint: string; courtFingerprint: string;
    decisionStatus: string; deliveryStatus: string;
    origin: { agent: string; route: string; threadId: string; correlationId: string };
  };
}
export interface FcrCouncilReturnInput {
  missionId: string;
  round: number;
  /** Must be supplied by trusted requireFounder middleware, not request JSON. */
  founder: FcrFounderSession;
  bundle: PortableCouncilReturnBundle;
  signal?: AbortSignal;
}
export interface FcrCouncilBusRuntime {
  /** False/unknown/throwing means disabled. Only a server-owned flag is valid. */
  enabled: () => Promise<boolean>;
  canAccessMission: (founder: FcrFounderSession, missionId: string) => Promise<boolean>;
  /** Independently re-read the persisted Council round from the owning DB. */
  loadPersisted: (missionId: string, round: number) => Promise<FcrCouncilRoundReadback | null>;
  /**
   * Must wrap the pinned, real Council runEmbeddedCouncilBus with legitimate
   * signer, sender, persistent claim-once journal and verified origin ACK.
   * This interface alone cannot establish those capabilities.
   */
  deliver: (context: {
    council: PortableCouncilReturnBundle['council'];
    court: PortableCouncilReturnBundle['court'];
    handoff: PortableCouncilReturnBundle['handoff'];
    origin: PortableCouncilReturnBundle['handoff']['origin'];
    founder: FcrFounderSession;
    signal?: AbortSignal;
  }) => Promise<{ status: string; delivered: boolean; idempotencyKey?: string }>;
}
const TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const requireCondition = (ok: boolean, reason: string): void => { if (!ok) throw new Error(reason); };
const validText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Purposefully not wired into an FCR HTTP route yet. Connecting this to an
 * externally callable endpoint requires independently proven caller identity,
 * founder scope, signed origin return and separate release authorization.
 */
export async function returnCouncilToOrigin(
  input: FcrCouncilReturnInput,
  runtime: FcrCouncilBusRuntime,
): Promise<{ status: string; productionVerified: false }> {
  requireCondition(Boolean(input && runtime), 'Council Bus input/runtime required');
  for (const name of ['enabled', 'canAccessMission', 'loadPersisted', 'deliver'] as const) {
    requireCondition(typeof runtime[name] === 'function', `Missing Council Bus runtime port: ${name}`);
  }
  requireCondition(TOKEN.test(input.missionId) && Number.isSafeInteger(input.round) && input.round >= 1,
    'Invalid mission/round');
  requireCondition(input.founder !== null && typeof input.founder === 'object' &&
    validText(input.founder.userId) && validText(input.founder.email), 'Verified founder session required');
  requireCondition(!input.signal?.aborted, 'Council Bus request aborted');
  requireCondition(await runtime.enabled() === true, 'FCR Council Bus disabled');
  requireCondition(await runtime.canAccessMission(input.founder, input.missionId) === true,
    'Council Bus mission access denied');
  const persisted = await runtime.loadPersisted(input.missionId, input.round);
  requireCondition(Boolean(persisted) && persisted?.mission_id === input.missionId &&
    persisted.round === input.round && persisted.transcript?.state === 'complete',
    'Expected complete persisted Council record');
  const { council, court, handoff } = input.bundle ?? {} as PortableCouncilReturnBundle;
  requireCondition(Boolean(council && court && handoff), 'Council Court handoff bundle required');
  const actual = persisted!.transcript;
  requireCondition(council.goal === actual.goal && council.sourceRef === actual.sourceRef &&
    Array.isArray(council.findings) && council.findings.length === actual.hops.length &&
    council.findings.every((finding, index) => {
      const hop = actual.hops[index];
      return Boolean(hop && finding.id === hop.toOperator && finding.finding === hop.answer &&
        Array.isArray(finding.evidenceRefs) && Array.isArray(hop.evidenceRefs) &&
        JSON.stringify(finding.evidenceRefs) === JSON.stringify(hop.evidenceRefs));
    }), 'Council Bus persisted transcript lineage mismatch');
  requireCondition(SHA256.test(council.fingerprint) && SHA256.test(court.fingerprint) &&
    court.councilFingerprint === council.fingerprint &&
    handoff.councilFingerprint === council.fingerprint &&
    handoff.courtFingerprint === court.fingerprint &&
    handoff.decisionStatus === court.verdict,
    'Council Bus Court/handoff lineage mismatch');
  requireCondition(handoff.deliveryStatus === 'PREPARED_NOT_SENT', 'Council Bus handoff not prepared');
  if (court.verdict !== 'READY_FOR_EXTERNAL_VERIFICATION') {
    return { status: 'COURT_HOLD', productionVerified: false };
  }
  requireCondition(handoff.origin !== null && typeof handoff.origin === 'object' &&
    ['agent', 'route', 'threadId', 'correlationId'].every(key =>
      TOKEN.test(handoff.origin[key as keyof typeof handoff.origin])),
    'Invalid return-to-origin identity');
  requireCondition(!input.signal?.aborted, 'Council Bus request aborted');
  requireCondition(await runtime.enabled() === true, 'FCR Council Bus disabled');
  const outcome = await runtime.deliver({
    council, court, handoff, origin: handoff.origin, founder: input.founder, signal: input.signal,
  });
  return {
    status: outcome?.status === 'ACK_REPORTED_BY_TRUSTED_PORT' && outcome.delivered === true
      ? 'ADAPTER_ACK_NOT_INDEPENDENTLY_VERIFIED' : 'NOT_DELIVERED',
    productionVerified: false,
  };
}
