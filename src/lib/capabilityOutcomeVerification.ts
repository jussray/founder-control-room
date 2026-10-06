import { createHash } from 'node:crypto';
import { getProjectEvidence, type ProjectEvidenceDependencies, type ProjectEvidenceReceipt } from './projectEvidenceAgent.js';
import {
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayResponseHash,
  type OperatorRelayResponseV1,
  type RelayOperatorId,
} from './operatorRelay.js';
import { OPERATOR_RELAY_PEERS } from './operatorRelayConstants.js';
import type { CapabilityTaskClass } from './modelCapabilityMarket.js';

export const CAPABILITY_OUTCOME_VERIFICATION_CONTRACT = 'fcr/capability-outcome-verification@v1' as const;

const SHA256 = /^[0-9a-f]{64}$/i;
const SHA40 = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BROWSER_CHECK = /playwright|browser|e2e/i;
const RELAY_OPERATORS = new Set<string>(OPERATOR_RELAY_PEERS);
const CAPABILITY_TASK_CLASSES: ReadonlySet<string> = new Set<CapabilityTaskClass>([
  'repository-repair',
  'architecture-review',
  'business-workflow',
  'scientific-research',
  'public-research',
  'cross-provider-drift',
  'browser-runtime',
  'founder-synthesis',
  'multimodal-generation',
]);

export interface CapabilityVerificationRequiredCheck {
  name: string;
  /** Provider-backed application identity when the check producer is load-bearing. */
  issuerId?: string | null;
}

export interface CapabilityOutcomeVerificationReceipt {
  contract: typeof CAPABILITY_OUTCOME_VERIFICATION_CONTRACT;
  taskClass: CapabilityTaskClass;
  relayId: string;
  responseHash: string;
  operatorId: RelayOperatorId;
  verifier: {
    kind: 'repository-provider';
    provider: string;
    independentObservation: true;
  };
  subject: {
    kind: 'repository';
    repository: string;
    exactSha: string;
  };
  requiredChecks: Array<{
    name: string;
    issuerId: string | null;
  }>;
  evidenceRefs: string[];
  verifiedAt: string;
  outcomeVerified: true;
  selectionAuthority: false;
  executionAuthority: false;
  verificationHash: string;
}

export interface RepositoryRepairVerificationInput {
  response: OperatorRelayResponseV1;
  repository: string;
  expectedHeadSha: string;
  requiredChecks: readonly CapabilityVerificationRequiredCheck[];
  requirePlaywright?: boolean;
}

export interface RepositoryRepairVerificationResult {
  verified: boolean;
  receipt: CapabilityOutcomeVerificationReceipt | null;
  blockers: string[];
  evidenceReceipt: ProjectEvidenceReceipt | null;
}

interface SignalRecord {
  id: string;
  name: string;
  status: string;
  commitSha: string;
  evidenceFingerprint: string | null;
  issuer: { kind: string; id: string } | null;
  startedAt: string | null;
  completedAt: string | null;
  detailsUrl: string | null;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizedEvidenceRefs(values: readonly unknown[]): string[] {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
  )].sort();
}

function normalizedChecks(values: readonly CapabilityVerificationRequiredCheck[]): Array<{ name: string; issuerId: string | null }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; issuerId: string | null }> = [];
  for (const value of values) {
    if (!value || typeof value.name !== 'string') continue;
    const name = value.name.trim().replace(/\s+/g, ' ');
    const key = normalizedName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({
      name,
      issuerId: typeof value.issuerId === 'string' ? value.issuerId.trim() || null : null,
    });
  }
  return result.sort((a, b) => normalizedName(a.name).localeCompare(normalizedName(b.name)));
}

function verificationIdentity(input: Omit<CapabilityOutcomeVerificationReceipt, 'verificationHash'>): unknown[] {
  return [
    CAPABILITY_OUTCOME_VERIFICATION_CONTRACT,
    input.taskClass,
    input.relayId,
    input.responseHash.toLowerCase(),
    input.operatorId,
    input.verifier.kind,
    input.verifier.provider,
    true,
    input.subject.kind,
    input.subject.repository,
    input.subject.exactSha.toLowerCase(),
    input.requiredChecks.map((check) => [normalizedName(check.name), check.issuerId]),
    normalizedEvidenceRefs(input.evidenceRefs),
    input.verifiedAt,
    true,
    false,
    false,
  ];
}

export function capabilityOutcomeVerificationHash(
  input: Omit<CapabilityOutcomeVerificationReceipt, 'verificationHash'>,
): string {
  return createHash('sha256').update(JSON.stringify(verificationIdentity(input))).digest('hex');
}

export function validateCapabilityOutcomeVerificationReceipt(
  value: CapabilityOutcomeVerificationReceipt,
): string[] {
  const errors: string[] = [];
  if (value.contract !== CAPABILITY_OUTCOME_VERIFICATION_CONTRACT) errors.push('unsupported capability outcome verification contract');
  if (!CAPABILITY_TASK_CLASSES.has(value.taskClass)) errors.push('verification taskClass is unsupported');
  if (!value.relayId?.trim()) errors.push('verification relayId is required');
  if (!SHA256.test(value.responseHash ?? '')) errors.push('verification responseHash must be sha256');
  if (!RELAY_OPERATORS.has(value.operatorId)) errors.push('verification operatorId is unsupported');
  if (value.verifier?.kind !== 'repository-provider' || !value.verifier?.provider?.trim()) errors.push('repository verifier identity is required');
  if (value.verifier?.independentObservation !== true) errors.push('verification must be independently observed');
  if (value.subject?.kind !== 'repository' || !REPOSITORY.test(value.subject?.repository ?? '')) errors.push('verification repository subject is invalid');
  if (!SHA40.test(value.subject?.exactSha ?? '')) errors.push('verification exactSha must be a full commit sha');
  const checks = normalizedChecks(value.requiredChecks ?? []);
  if (checks.length === 0 || checks.length !== value.requiredChecks.length) errors.push('verification required checks must be unique and non-empty');
  if (
    !Array.isArray(value.evidenceRefs)
    || value.evidenceRefs.some((ref) => typeof ref !== 'string')
    || normalizedEvidenceRefs(value.evidenceRefs).length === 0
  ) errors.push('verification evidenceRefs are required');
  if (!Number.isFinite(Date.parse(value.verifiedAt ?? ''))) errors.push('verification verifiedAt must be RFC3339-compatible');
  if (value.outcomeVerified !== true) errors.push('verification must explicitly confirm the outcome');
  if (value.selectionAuthority !== false || value.executionAuthority !== false) errors.push('verification cannot grant routing or execution authority');
  if (!SHA256.test(value.verificationHash ?? '')) errors.push('verificationHash must be sha256');
  if (errors.length === 0) {
    const { verificationHash: _verificationHash, ...identity } = value;
    if (capabilityOutcomeVerificationHash(identity) !== value.verificationHash) errors.push('verificationHash does not match verification content');
  }
  return [...new Set(errors)];
}

function relayResponseIntegrityErrors(response: OperatorRelayResponseV1): string[] {
  const errors: string[] = [];
  if (response.contract !== OPERATOR_RELAY_RESPONSE_CONTRACT) errors.push('relay response contract is unsupported');
  if (!response.relayId?.trim()) errors.push('relay response id is required');
  if (!SHA256.test(response.requestHash ?? '')) errors.push('relay requestHash must be sha256');
  if (!SHA256.test(response.responseHash ?? '')) errors.push('relay responseHash must be sha256');
  if (!RELAY_OPERATORS.has(response.fromOperator)) errors.push('relay response operator is unsupported');
  if (!['accepted', 'completed', 'blocked', 'failed'].includes(response.status)) errors.push('relay outcome status is unsupported');
  if (response.authorityRequested !== 'none') errors.push('relay outcome requested authority');
  if (!Array.isArray(response.evidenceRefs) || response.evidenceRefs.some((item) => typeof item !== 'string')) errors.push('relay evidenceRefs are malformed');
  if (!Array.isArray(response.unresolved) || response.unresolved.some((item) => typeof item !== 'string')) errors.push('relay unresolved list is malformed');
  if (!Number.isFinite(Date.parse(response.completedAt ?? ''))) errors.push('relay completedAt is invalid');
  if (errors.length === 0) {
    const { responseHash: _responseHash, ...identity } = response;
    if (operatorRelayResponseHash(identity) !== response.responseHash) errors.push('relay responseHash does not match response content');
  }
  return [...new Set(errors)];
}

function relayResponseErrors(response: OperatorRelayResponseV1): string[] {
  const errors = relayResponseIntegrityErrors(response);
  if (response.status !== 'completed') errors.push('repository repair verification requires a completed relay outcome');
  if (Array.isArray(response.evidenceRefs) && normalizedEvidenceRefs(response.evidenceRefs).length === 0) {
    errors.push('completed relay outcome has no provider evidence');
  }
  if (
    Array.isArray(response.unresolved)
    && response.unresolved.every((item) => typeof item === 'string')
    && response.unresolved.map((item) => item.trim()).filter(Boolean).length > 0
  ) {
    errors.push('relay outcome still reports unresolved work');
  }
  return [...new Set(errors)];
}

function parseSignal(value: unknown): SignalRecord | null {
  const raw = record(value);
  if (!raw) return null;
  const issuerRaw = record(raw.issuer);
  const issuer = issuerRaw
    ? { kind: text(issuerRaw.kind), id: text(issuerRaw.id) }
    : null;
  const parsed: SignalRecord = {
    id: text(raw.id),
    name: text(raw.name),
    status: text(raw.status),
    commitSha: text(raw.commitSha).toLowerCase(),
    evidenceFingerprint: text(raw.evidenceFingerprint) || null,
    issuer,
    startedAt: text(raw.startedAt) || null,
    completedAt: text(raw.completedAt) || null,
    detailsUrl: text(raw.detailsUrl) || null,
  };
  if (!parsed.id || !parsed.name || !parsed.status || !SHA40.test(parsed.commitSha)) return null;
  return parsed;
}

function signalTime(signal: SignalRecord): number {
  const started = Date.parse(signal.startedAt ?? '');
  if (Number.isFinite(started)) return started;
  const completed = Date.parse(signal.completedAt ?? '');
  return Number.isFinite(completed) ? completed : Number.NaN;
}

function numericId(value: string): bigint | null {
  return /^\d+$/.test(value) ? BigInt(value) : null;
}

function isNewerSignal(candidate: SignalRecord, current: SignalRecord): boolean {
  const candidateTime = signalTime(candidate);
  const currentTime = signalTime(current);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  const candidateNumeric = numericId(candidate.id);
  const currentNumeric = numericId(current.id);
  if (candidateNumeric !== null && currentNumeric !== null) return candidateNumeric > currentNumeric;
  return candidate.id.localeCompare(current.id) > 0;
}

function latestSignalsByName(signals: SignalRecord[]): Map<string, SignalRecord> {
  const latest = new Map<string, SignalRecord>();
  for (const signal of signals) {
    const key = normalizedName(signal.name);
    const current = latest.get(key);
    if (!current || isNewerSignal(signal, current)) latest.set(key, signal);
  }
  return latest;
}

function evidenceItem(receipt: ProjectEvidenceReceipt, type: string) {
  return receipt.evidence.find((item) => item.type === type) ?? null;
}

function repositoryEvidenceErrors(
  receipt: ProjectEvidenceReceipt,
  repository: string,
  exactSha: string,
): string[] {
  const errors: string[] = [];
  if (receipt.contract !== 'juss/project-evidence-receipt@v1') errors.push('project evidence contract drifted');
  if (receipt.repository !== repository) errors.push('project evidence repository does not match verification subject');
  if ((receipt.exactSha ?? '').toLowerCase() !== exactSha.toLowerCase()) errors.push('project evidence exact sha does not match verification subject');
  if (receipt.readOnly !== true || receipt.authorityChanged !== false || receipt.executionAuthorized !== false) {
    errors.push('project evidence crossed its read-only authority boundary');
  }

  const repositoryItem = evidenceItem(receipt, 'repository');
  const repositoryData = record(repositoryItem?.data);
  if (repositoryItem?.status !== 'verified') errors.push('repository identity is not independently verified');
  if (text(repositoryData?.repository) !== repository) errors.push('repository evidence data does not match subject repository');
  if (text(repositoryData?.exactSha).toLowerCase() !== exactSha.toLowerCase()) errors.push('repository evidence data does not match subject sha');
  return errors;
}

export function matchingCapabilityOutcomeVerification(
  verification: CapabilityOutcomeVerificationReceipt,
  response: OperatorRelayResponseV1,
  taskClass: CapabilityTaskClass,
  operatorId: RelayOperatorId,
): boolean {
  if (validateCapabilityOutcomeVerificationReceipt(verification).length > 0) return false;
  if (relayResponseIntegrityErrors(response).length > 0 || response.status === 'accepted') return false;
  return verification.taskClass === taskClass
    && verification.relayId === response.relayId
    && verification.responseHash === response.responseHash
    && verification.operatorId === operatorId
    && response.fromOperator === operatorId;
}

export async function verifyRepositoryRepairOutcome(
  input: RepositoryRepairVerificationInput,
  dependencies: Pick<ProjectEvidenceDependencies, 'providerFactory'> = {},
): Promise<RepositoryRepairVerificationResult> {
  const blockers: string[] = [];
  const repository = input.repository.trim();
  const expectedHeadSha = input.expectedHeadSha.trim().toLowerCase();
  const checks = normalizedChecks(input.requiredChecks);

  if (!REPOSITORY.test(repository)) blockers.push('repository must use owner/name format');
  if (!SHA40.test(expectedHeadSha)) blockers.push('expectedHeadSha must be a full commit sha');
  if (checks.length === 0 || checks.length !== input.requiredChecks.length) blockers.push('required checks must be unique and non-empty');
  if (input.requirePlaywright && !checks.some((check) => BROWSER_CHECK.test(check.name))) {
    blockers.push('Playwright-required repository repair must declare a browser-shaped required check');
  }
  blockers.push(...relayResponseErrors(input.response));

  const staticBlockers = [...new Set(blockers)];
  if (staticBlockers.length > 0) {
    return { verified: false, receipt: null, blockers: staticBlockers, evidenceReceipt: null };
  }

  let evidenceReceipt: ProjectEvidenceReceipt;
  try {
    evidenceReceipt = await getProjectEvidence({
      repository,
      ref: expectedHeadSha,
      evidence_types: ['repository', 'ci', ...(input.requirePlaywright ? ['playwright' as const] : [])],
    }, dependencies);
  } catch {
    return {
      verified: false,
      receipt: null,
      blockers: ['project evidence read failed'],
      evidenceReceipt: null,
    };
  }

  blockers.push(...repositoryEvidenceErrors(evidenceReceipt, repository, expectedHeadSha));

  const ci = evidenceItem(evidenceReceipt, 'ci');
  if (ci?.status !== 'verified' || !Array.isArray(ci.data)) {
    blockers.push('exact-head CI evidence is unavailable');
  }

  const parsedSignals = Array.isArray(ci?.data)
    ? ci.data.map(parseSignal).filter((signal): signal is SignalRecord => signal !== null)
    : [];
  const exactSignals = parsedSignals.filter((signal) => signal.commitSha === expectedHeadSha);
  const latest = latestSignalsByName(exactSignals);
  const independentEvidenceRefs: string[] = [];
  const selectedSignals: SignalRecord[] = [];

  for (const check of checks) {
    const key = normalizedName(check.name);
    const candidates = exactSignals.filter((signal) => normalizedName(signal.name) === key);
    if (candidates.some((signal) => !Number.isFinite(signalTime(signal)))) {
      blockers.push('required check has an unplaceable attempt: ' + check.name);
      continue;
    }

    const signal = latest.get(key);
    if (!signal) {
      blockers.push('required exact-head check is missing: ' + check.name);
      continue;
    }
    if (signal.status !== 'passed') blockers.push('required exact-head check is not passed: ' + check.name + '=' + signal.status);
    if (check.issuerId) {
      if (signal.issuer?.kind !== 'app' || signal.issuer.id !== check.issuerId) {
        blockers.push('required exact-head check producer mismatch: ' + check.name);
      }
    }
    selectedSignals.push(signal);
    independentEvidenceRefs.push(signal.detailsUrl || (ci?.source + ':verification:' + signal.id));
    if (signal.evidenceFingerprint) independentEvidenceRefs.push(ci?.source + ':fingerprint:' + signal.evidenceFingerprint);
  }

  if (input.requirePlaywright) {
    const playwright = evidenceItem(evidenceReceipt, 'playwright');
    if (playwright?.status !== 'verified' || !Array.isArray(playwright.data)) blockers.push('Playwright evidence is unavailable');
    const browserSignals = Array.isArray(playwright?.data)
      ? playwright.data.map(parseSignal).filter((signal): signal is SignalRecord => signal !== null && signal.commitSha === expectedHeadSha)
      : [];
    const latestBrowser = latestSignalsByName(browserSignals);
    if (![...latestBrowser.values()].some((signal) => signal.status === 'passed')) {
      blockers.push('no passed exact-head Playwright/browser signal is available');
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  if (uniqueBlockers.length > 0) {
    return { verified: false, receipt: null, blockers: uniqueBlockers, evidenceReceipt };
  }

  const provider = ci?.source?.trim() ?? '';
  const verifiedAtMs = Math.max(...selectedSignals.map(signalTime));
  const identity: Omit<CapabilityOutcomeVerificationReceipt, 'verificationHash'> = {
    contract: CAPABILITY_OUTCOME_VERIFICATION_CONTRACT,
    taskClass: 'repository-repair',
    relayId: input.response.relayId,
    responseHash: input.response.responseHash,
    operatorId: input.response.fromOperator,
    verifier: {
      kind: 'repository-provider',
      provider,
      independentObservation: true,
    },
    subject: {
      kind: 'repository',
      repository,
      exactSha: expectedHeadSha,
    },
    requiredChecks: checks,
    evidenceRefs: normalizedEvidenceRefs(independentEvidenceRefs),
    verifiedAt: new Date(verifiedAtMs).toISOString(),
    outcomeVerified: true,
    selectionAuthority: false,
    executionAuthority: false,
  };
  const receipt: CapabilityOutcomeVerificationReceipt = {
    ...identity,
    verificationHash: capabilityOutcomeVerificationHash(identity),
  };

  return { verified: true, receipt, blockers: [], evidenceReceipt };
}
