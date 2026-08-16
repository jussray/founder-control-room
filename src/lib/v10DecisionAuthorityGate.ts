import { createHash } from 'node:crypto';

export const V10_DECISION_CYCLE_CONTRACT = 'juss-v10/decision-cycle@v1' as const;

export const V10_DECISION_LENSES = [
  'human',
  'me',
  'futureyou',
  'truthmode',
  'confess',
  'billgates',
  'elonmusk',
  'ooda',
  'redteam',
  'lindymode',
  'data-analytics',
  'product-design',
  'deep-research',
  'steal',
] as const;

export type V10DecisionLens = (typeof V10_DECISION_LENSES)[number];

export interface V10DecisionMetric {
  name: string;
  baseline: string;
  target: string;
  source: string;
}

export interface V10DecisionLensReport {
  lens: string;
  finding: string;
  recommendation: string;
  confidence: number;
  evidenceRefs: string[];
  assumptions: string[];
  risks: string[];
  blockers: string[];
  requestedEvidence: string[];
  metrics: V10DecisionMetric[];
}

export interface V10DecisionReality {
  verified: string[];
  inferred: string[];
  unknown: string[];
  blocked: string[];
}

export interface V10DecisionReceipt {
  contract: typeof V10_DECISION_CYCLE_CONTRACT;
  goal: string;
  workspaceId: string;
  projectSlug: string;
  expectedHeadSha: string;
  customerOutcome: string;
  desiredState: string;
  currentState: string;
  bottleneck: string;
  decisionClass: 'reversible' | 'high-consequence';
  reality: V10DecisionReality;
  lensReports: V10DecisionLensReport[];
  dissent: string[];
  candidateOptions: string[];
  recommendation: string;
  authorityCeiling: 'reason';
  proofRequirements: string[];
  outcomeSignals: string[];
  rollback: string;
  stopConditions: string[];
  nextGate: string;
  requiresFounderApproval: true;
  executionAuthorized: false;
  decisionHash: string;
}

export interface V10DecisionAuthorityGateInput {
  decisionReceipt: unknown;
  promptOSDecisionHash: string;
  expectedProjectSlug: string;
  currentHeadSha?: string;
  requireExactHead?: boolean;
  founderApproved: boolean;
}

export interface V10DecisionAuthorityGateResult {
  validDecisionReceipt: boolean;
  promptOSBindingValid: boolean;
  projectBindingValid: boolean;
  exactHeadBindingValid: boolean;
  founderApprovalPresent: boolean;
  acceptedForAuthorityResolution: boolean;
  executionAuthorized: false;
  decisionHash: string | null;
  errors: string[];
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const REALITY_KEYS = ['verified', 'inferred', 'unknown', 'blocked'] as const;
const DECISION_CLASSES = new Set(['reversible', 'high-consequence']);
const REQUIRED_LENSES = new Set<string>(V10_DECISION_LENSES);

function text(value: unknown, maxLength = 4_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function strings(value: unknown, maxItems = 40, maxLength = 1_000): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxLength)).filter(Boolean))]
    .sort()
    .slice(0, maxItems);
}

function metric(value: unknown): V10DecisionMetric | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const normalized = {
    name: text(raw.name, 160),
    baseline: text(raw.baseline, 500),
    target: text(raw.target, 500),
    source: text(raw.source, 500),
  };
  return normalized.name ? normalized : null;
}

function lensReport(value: unknown): V10DecisionLensReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const confidence = Number(raw.confidence);
  const lens = text(raw.lens, 80).toLowerCase();
  if (!lens) return null;
  return {
    lens,
    finding: text(raw.finding, 3_000),
    recommendation: text(raw.recommendation, 2_000),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    evidenceRefs: strings(raw.evidenceRefs, 30),
    assumptions: strings(raw.assumptions, 20),
    risks: strings(raw.risks, 20),
    blockers: strings(raw.blockers, 20),
    requestedEvidence: strings(raw.requestedEvidence, 20),
    metrics: Array.isArray(raw.metrics)
      ? raw.metrics.map(metric).filter((item): item is V10DecisionMetric => item !== null).slice(0, 12)
      : [],
  };
}

function reality(value: unknown): V10DecisionReality {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    verified: strings(raw.verified),
    inferred: strings(raw.inferred),
    unknown: strings(raw.unknown),
    blocked: strings(raw.blocked),
  };
}

function normalizeReceipt(value: unknown): V10DecisionReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const reports = Array.isArray(raw.lensReports)
    ? raw.lensReports.map(lensReport).filter((item): item is V10DecisionLensReport => item !== null)
      .sort((left, right) => left.lens.localeCompare(right.lens))
    : [];

  return {
    contract: raw.contract === V10_DECISION_CYCLE_CONTRACT ? V10_DECISION_CYCLE_CONTRACT : V10_DECISION_CYCLE_CONTRACT,
    goal: text(raw.goal),
    workspaceId: text(raw.workspaceId, 160),
    projectSlug: text(raw.projectSlug, 160),
    expectedHeadSha: text(raw.expectedHeadSha, 40).toLowerCase(),
    customerOutcome: text(raw.customerOutcome),
    desiredState: text(raw.desiredState),
    currentState: text(raw.currentState),
    bottleneck: text(raw.bottleneck),
    decisionClass: raw.decisionClass === 'high-consequence' ? 'high-consequence' : 'reversible',
    reality: reality(raw.reality),
    lensReports: reports,
    dissent: strings(raw.dissent, 30, 1_500),
    candidateOptions: strings(raw.candidateOptions, 20, 1_500),
    recommendation: text(raw.recommendation),
    authorityCeiling: 'reason',
    proofRequirements: strings(raw.proofRequirements, 30),
    outcomeSignals: strings(raw.outcomeSignals, 30),
    rollback: text(raw.rollback),
    stopConditions: strings(raw.stopConditions, 30),
    nextGate: text(raw.nextGate),
    requiresFounderApproval: true,
    executionAuthorized: false,
    decisionHash: text(raw.decisionHash, 64).toLowerCase(),
  };
}

export function v10DecisionReceiptSeed(receipt: Omit<V10DecisionReceipt, 'decisionHash'> | V10DecisionReceipt): string {
  return JSON.stringify([
    receipt.contract,
    receipt.goal,
    receipt.workspaceId,
    receipt.projectSlug,
    receipt.expectedHeadSha,
    receipt.customerOutcome,
    receipt.desiredState,
    receipt.currentState,
    receipt.bottleneck,
    receipt.decisionClass,
    REALITY_KEYS.map((key) => [key, receipt.reality[key]]),
    [...receipt.lensReports].sort((a, b) => a.lens.localeCompare(b.lens)).map((report) => [
      report.lens,
      report.finding,
      report.recommendation,
      report.confidence,
      report.evidenceRefs,
      report.assumptions,
      report.risks,
      report.blockers,
      report.requestedEvidence,
      report.metrics.map((item) => [item.name, item.baseline, item.target, item.source]),
    ]),
    receipt.dissent,
    receipt.candidateOptions,
    receipt.recommendation,
    receipt.authorityCeiling,
    receipt.proofRequirements,
    receipt.outcomeSignals,
    receipt.rollback,
    receipt.stopConditions,
    receipt.nextGate,
    receipt.requiresFounderApproval,
    receipt.executionAuthorized,
  ]);
}

export function v10DecisionReceiptHash(receipt: Omit<V10DecisionReceipt, 'decisionHash'> | V10DecisionReceipt): string {
  return createHash('sha256').update(v10DecisionReceiptSeed(receipt)).digest('hex');
}

export function validateV10DecisionReceipt(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['decision receipt shape is invalid'];
  const raw = value as Record<string, unknown>;
  const receipt = normalizeReceipt(value);
  if (!receipt) return ['decision receipt shape is invalid'];

  if (raw.contract !== V10_DECISION_CYCLE_CONTRACT) errors.push('unsupported decision receipt contract');
  if (!text(raw.goal)) errors.push('decision receipt goal is required');
  if (!text(raw.workspaceId, 160)) errors.push('decision receipt workspaceId is required');
  if (!text(raw.projectSlug, 160)) errors.push('decision receipt projectSlug is required');
  if (text(raw.expectedHeadSha) && !FULL_SHA.test(text(raw.expectedHeadSha, 40))) {
    errors.push('decision receipt expectedHeadSha must be a full Git SHA when present');
  }
  if (!text(raw.customerOutcome)) errors.push('decision receipt customerOutcome is required');
  if (!text(raw.desiredState)) errors.push('decision receipt desiredState is required');
  if (!text(raw.currentState)) errors.push('decision receipt currentState is required');
  if (!text(raw.bottleneck)) errors.push('decision receipt bottleneck is required');
  if (!DECISION_CLASSES.has(text(raw.decisionClass, 40))) errors.push('unsupported decision class');

  if (REALITY_KEYS.every((key) => receipt.reality[key].length === 0)) {
    errors.push('decision receipt requires classified reality');
  }

  const seen = new Set<string>();
  for (const report of receipt.lensReports) {
    if (seen.has(report.lens)) errors.push(`duplicate decision lens: ${report.lens}`);
    seen.add(report.lens);
    if (!REQUIRED_LENSES.has(report.lens)) errors.push(`unsupported decision lens: ${report.lens}`);
    if (!report.finding) errors.push(`decision lens ${report.lens} finding is required`);
    if (!report.recommendation) errors.push(`decision lens ${report.lens} recommendation is required`);
  }
  for (const lens of V10_DECISION_LENSES) {
    if (!seen.has(lens)) errors.push(`required V10 decision lens missing: ${lens}`);
  }

  if (receipt.candidateOptions.length === 0) errors.push('decision receipt candidate options are required');
  if (!receipt.recommendation) errors.push('decision receipt recommendation is required');
  if (raw.authorityCeiling !== 'reason') errors.push('decision receipt authority ceiling must remain reason');
  if (raw.requiresFounderApproval !== true) errors.push('decision receipt must require founder approval');
  if (raw.executionAuthorized !== false) errors.push('decision receipt cannot authorize execution');
  if (receipt.proofRequirements.length === 0) errors.push('decision receipt proof requirements are required');
  if (receipt.outcomeSignals.length === 0) errors.push('decision receipt outcome signals are required');
  if (!receipt.rollback) errors.push('decision receipt rollback is required');
  if (receipt.stopConditions.length === 0) errors.push('decision receipt stop conditions are required');
  if (!receipt.nextGate) errors.push('decision receipt nextGate is required');

  const submittedHash = text(raw.decisionHash, 64).toLowerCase();
  if (!HASH.test(submittedHash)) errors.push('decision receipt decisionHash must be sha256');
  else if (v10DecisionReceiptHash(receipt) !== submittedHash) errors.push('decision receipt hash does not match decision content');

  return errors;
}

function same(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Validate a Chief AI V10 decision only as context for FCR's existing authority resolver.
 *
 * The gate independently recomputes the decision receipt hash, binds the same hash carried
 * by PromptOS, verifies project/exact-head context when requested, and requires explicit
 * founder approval. Passing this gate NEVER authorizes execution by itself.
 */
export function evaluateV10DecisionAuthorityGate(
  input: V10DecisionAuthorityGateInput,
): V10DecisionAuthorityGateResult {
  const errors = validateV10DecisionReceipt(input.decisionReceipt);
  const receipt = normalizeReceipt(input.decisionReceipt);
  const decisionHash = receipt?.decisionHash || null;

  const validDecisionReceipt = errors.length === 0;
  const promptHash = text(input.promptOSDecisionHash, 64).toLowerCase();
  const promptOSBindingValid = Boolean(
    decisionHash && HASH.test(promptHash) && same(promptHash, decisionHash),
  );
  if (!promptOSBindingValid) errors.push('PromptOS decision hash does not match the validated Chief decision receipt');

  const expectedProject = text(input.expectedProjectSlug, 160);
  const projectBindingValid = Boolean(receipt && expectedProject && same(receipt.projectSlug, expectedProject));
  if (!projectBindingValid) errors.push('decision project does not match FCR project context');

  let exactHeadBindingValid = true;
  if (input.requireExactHead === true) {
    const currentHead = text(input.currentHeadSha, 40).toLowerCase();
    exactHeadBindingValid = Boolean(
      receipt
      && FULL_SHA.test(receipt.expectedHeadSha)
      && FULL_SHA.test(currentHead)
      && same(receipt.expectedHeadSha, currentHead),
    );
    if (!exactHeadBindingValid) errors.push('decision expected head does not match current FCR project head');
  }

  const founderApprovalPresent = input.founderApproved === true;
  if (!founderApprovalPresent) errors.push('founder approval is required before authority resolution');

  const uniqueErrors = [...new Set(errors)];
  const acceptedForAuthorityResolution = validDecisionReceipt
    && promptOSBindingValid
    && projectBindingValid
    && exactHeadBindingValid
    && founderApprovalPresent
    && uniqueErrors.length === 0;

  return Object.freeze({
    validDecisionReceipt,
    promptOSBindingValid,
    projectBindingValid,
    exactHeadBindingValid,
    founderApprovalPresent,
    acceptedForAuthorityResolution,
    executionAuthorized: false as const,
    decisionHash,
    errors: uniqueErrors,
  });
}
