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

const RECEIPT_KEYS = new Set([
  'contract', 'goal', 'workspaceId', 'projectSlug', 'expectedHeadSha',
  'customerOutcome', 'desiredState', 'currentState', 'bottleneck', 'decisionClass',
  'reality', 'lensReports', 'dissent', 'candidateOptions', 'recommendation',
  'authorityCeiling', 'proofRequirements', 'outcomeSignals', 'rollback',
  'stopConditions', 'nextGate', 'requiresFounderApproval', 'executionAuthorized',
  'decisionHash',
]);
const REALITY_KEY_SET = new Set<string>(REALITY_KEYS);
const LENS_REPORT_KEYS = new Set([
  'lens', 'finding', 'recommendation', 'confidence', 'evidenceRefs', 'assumptions',
  'risks', 'blockers', 'requestedEvidence', 'metrics',
]);
const METRIC_KEYS = new Set(['name', 'baseline', 'target', 'source']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rawText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function text(value: unknown, maxLength = 4_000): string {
  return rawText(value).slice(0, maxLength);
}

function strings(value: unknown, maxItems = 40, maxLength = 1_000): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxLength)).filter(Boolean))]
    .sort()
    .slice(0, maxItems);
}

function unknownKeyErrors(value: unknown, allowed: ReadonlySet<string>, path: string): string[] {
  const raw = record(value);
  if (!raw) return [];
  return Object.keys(raw)
    .filter((key) => !allowed.has(key))
    .sort()
    .map((key) => `unknown ${path} field: ${key}`);
}

function validateBoundedText(
  errors: string[], value: unknown, label: string, maxLength: number, required = true,
): void {
  if (typeof value !== 'string') {
    if (required) errors.push(`${label} is required`);
    return;
  }
  const normalized = value.trim();
  if (required && !normalized) errors.push(`${label} is required`);
  if (normalized.length > maxLength) errors.push(`${label} exceeds ${maxLength} characters`);
}

function validateBoundedStringList(
  errors: string[], value: unknown, label: string, maxItems: number, maxLength: number,
  required = false,
): void {
  if (!Array.isArray(value)) {
    if (required) errors.push(`${label} must be an array`);
    return;
  }
  if (value.length > maxItems) errors.push(`${label} exceeds ${maxItems} items`);
  if (required && value.length === 0) errors.push(`${label} is required`);
  value.forEach((item, index) => {
    if (typeof item !== 'string') {
      errors.push(`${label}[${index}] must be a string`);
      return;
    }
    if (item.trim().length > maxLength) {
      errors.push(`${label}[${index}] exceeds ${maxLength} characters`);
    }
  });
}

function validateRawMetric(errors: string[], value: unknown, path: string): void {
  const raw = record(value);
  if (!raw) {
    errors.push(`${path} must be an object`);
    return;
  }
  errors.push(...unknownKeyErrors(raw, METRIC_KEYS, path));
  validateBoundedText(errors, raw.name, `${path}.name`, 160);
  validateBoundedText(errors, raw.baseline, `${path}.baseline`, 500, false);
  validateBoundedText(errors, raw.target, `${path}.target`, 500, false);
  validateBoundedText(errors, raw.source, `${path}.source`, 500, false);
}

function validateRawLensReport(errors: string[], value: unknown, index: number): void {
  const path = `decision lens[${index}]`;
  const raw = record(value);
  if (!raw) {
    errors.push(`${path} must be an object`);
    return;
  }
  errors.push(...unknownKeyErrors(raw, LENS_REPORT_KEYS, path));
  validateBoundedText(errors, raw.lens, `${path}.lens`, 80);
  validateBoundedText(errors, raw.finding, `${path}.finding`, 3_000);
  validateBoundedText(errors, raw.recommendation, `${path}.recommendation`, 2_000);
  if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence)) {
    errors.push(`${path}.confidence must be a finite number`);
  } else if (raw.confidence < 0 || raw.confidence > 1) {
    errors.push(`${path}.confidence must be between 0 and 1`);
  }
  validateBoundedStringList(errors, raw.evidenceRefs, `${path}.evidenceRefs`, 30, 1_000);
  validateBoundedStringList(errors, raw.assumptions, `${path}.assumptions`, 20, 1_000);
  validateBoundedStringList(errors, raw.risks, `${path}.risks`, 20, 1_000);
  validateBoundedStringList(errors, raw.blockers, `${path}.blockers`, 20, 1_000);
  validateBoundedStringList(errors, raw.requestedEvidence, `${path}.requestedEvidence`, 20, 1_000);
  if (!Array.isArray(raw.metrics)) {
    errors.push(`${path}.metrics must be an array`);
  } else {
    if (raw.metrics.length > 12) errors.push(`${path}.metrics exceeds 12 items`);
    raw.metrics.forEach((entry, metricIndex) => {
      validateRawMetric(errors, entry, `${path}.metrics[${metricIndex}]`);
    });
  }
}

function validateRawReceiptBounds(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];
  errors.push(...unknownKeyErrors(raw, RECEIPT_KEYS, 'decision receipt'));

  validateBoundedText(errors, raw.goal, 'decision receipt goal', 4_000);
  validateBoundedText(errors, raw.workspaceId, 'decision receipt workspaceId', 160);
  validateBoundedText(errors, raw.projectSlug, 'decision receipt projectSlug', 160);
  validateBoundedText(errors, raw.customerOutcome, 'decision receipt customerOutcome', 4_000);
  validateBoundedText(errors, raw.desiredState, 'decision receipt desiredState', 4_000);
  validateBoundedText(errors, raw.currentState, 'decision receipt currentState', 4_000);
  validateBoundedText(errors, raw.bottleneck, 'decision receipt bottleneck', 4_000);
  validateBoundedText(errors, raw.recommendation, 'decision receipt recommendation', 4_000);
  validateBoundedText(errors, raw.rollback, 'decision receipt rollback', 4_000);
  validateBoundedText(errors, raw.nextGate, 'decision receipt nextGate', 4_000);

  validateBoundedStringList(errors, raw.dissent, 'decision receipt dissent', 30, 1_500);
  validateBoundedStringList(errors, raw.candidateOptions, 'decision receipt candidateOptions', 20, 1_500, true);
  validateBoundedStringList(errors, raw.proofRequirements, 'decision receipt proofRequirements', 30, 1_000, true);
  validateBoundedStringList(errors, raw.outcomeSignals, 'decision receipt outcomeSignals', 30, 1_000, true);
  validateBoundedStringList(errors, raw.stopConditions, 'decision receipt stopConditions', 30, 1_000, true);

  const rawReality = record(raw.reality);
  if (!rawReality) {
    errors.push('decision receipt reality must be an object');
  } else {
    errors.push(...unknownKeyErrors(rawReality, REALITY_KEY_SET, 'decision reality'));
    for (const key of REALITY_KEYS) {
      validateBoundedStringList(errors, rawReality[key], `decision reality.${key}`, 40, 1_000);
    }
  }

  if (!Array.isArray(raw.lensReports)) {
    errors.push('decision receipt lensReports must be an array');
  } else {
    if (raw.lensReports.length > V10_DECISION_LENSES.length) {
      errors.push(`decision receipt lensReports exceeds ${V10_DECISION_LENSES.length} items`);
    }
    raw.lensReports.forEach((entry, index) => validateRawLensReport(errors, entry, index));
  }

  return errors;
}

function metric(value: unknown): V10DecisionMetric | null {
  const raw = record(value);
  if (!raw) return null;
  const normalized = {
    name: text(raw.name, 160),
    baseline: text(raw.baseline, 500),
    target: text(raw.target, 500),
    source: text(raw.source, 500),
  };
  return normalized.name ? normalized : null;
}

function lensReport(value: unknown): V10DecisionLensReport | null {
  const raw = record(value);
  if (!raw) return null;
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
  const raw = record(value) ?? {};
  return {
    verified: strings(raw.verified),
    inferred: strings(raw.inferred),
    unknown: strings(raw.unknown),
    blocked: strings(raw.blocked),
  };
}

function normalizeReceipt(value: unknown): V10DecisionReceipt | null {
  const raw = record(value);
  if (!raw) return null;
  const reports = Array.isArray(raw.lensReports)
    ? raw.lensReports.map(lensReport).filter((item): item is V10DecisionLensReport => item !== null)
      .sort((left, right) => left.lens.localeCompare(right.lens))
    : [];

  return {
    contract: V10_DECISION_CYCLE_CONTRACT,
    goal: text(raw.goal),
    workspaceId: text(raw.workspaceId, 160),
    projectSlug: text(raw.projectSlug, 160),
    expectedHeadSha: rawText(raw.expectedHeadSha).toLowerCase(),
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
    decisionHash: rawText(raw.decisionHash).toLowerCase(),
  };
}

export function v10DecisionReceiptSeed(
  receipt: Omit<V10DecisionReceipt, 'decisionHash'> | V10DecisionReceipt,
): string {
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

export function v10DecisionReceiptHash(
  receipt: Omit<V10DecisionReceipt, 'decisionHash'> | V10DecisionReceipt,
): string {
  return createHash('sha256').update(v10DecisionReceiptSeed(receipt)).digest('hex');
}

export function validateV10DecisionReceipt(value: unknown): string[] {
  const raw = record(value);
  if (!raw) return ['decision receipt shape is invalid'];

  const errors = validateRawReceiptBounds(raw);
  const receipt = normalizeReceipt(value);
  if (!receipt) return ['decision receipt shape is invalid'];

  if (raw.contract !== V10_DECISION_CYCLE_CONTRACT) errors.push('unsupported decision receipt contract');
  if (raw.expectedHeadSha !== undefined) {
    const submittedHead = rawText(raw.expectedHeadSha).toLowerCase();
    if (!FULL_SHA.test(submittedHead)) {
      errors.push('decision receipt expectedHeadSha must be a full Git SHA when present');
    }
  }
  if (!DECISION_CLASSES.has(rawText(raw.decisionClass))) errors.push('unsupported decision class');

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

  if (!receipt.recommendation) errors.push('decision receipt recommendation is required');
  if (raw.authorityCeiling !== 'reason') errors.push('decision receipt authority ceiling must remain reason');
  if (raw.requiresFounderApproval !== true) errors.push('decision receipt must require founder approval');
  if (raw.executionAuthorized !== false) errors.push('decision receipt cannot authorize execution');
  if (!receipt.rollback) errors.push('decision receipt rollback is required');
  if (!receipt.nextGate) errors.push('decision receipt nextGate is required');

  const submittedHash = rawText(raw.decisionHash).toLowerCase();
  if (!HASH.test(submittedHash)) errors.push('decision receipt decisionHash must be sha256');
  else if (v10DecisionReceiptHash(receipt) !== submittedHash) {
    errors.push('decision receipt hash does not match decision content');
  }

  return [...new Set(errors)];
}

function same(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Validate a Chief AI V10 decision only as context for FCR's existing authority resolver.
 * Passing this gate NEVER authorizes execution by itself.
 */
export function evaluateV10DecisionAuthorityGate(
  input: V10DecisionAuthorityGateInput,
): V10DecisionAuthorityGateResult {
  const errors = validateV10DecisionReceipt(input.decisionReceipt);
  const receipt = normalizeReceipt(input.decisionReceipt);
  const decisionHash = receipt?.decisionHash || null;

  const validDecisionReceipt = errors.length === 0;
  const promptHash = rawText(input.promptOSDecisionHash).toLowerCase();
  const promptOSBindingValid = Boolean(
    decisionHash && HASH.test(promptHash) && same(promptHash, decisionHash),
  );
  if (!promptOSBindingValid) {
    errors.push('PromptOS decision hash does not match the validated Chief decision receipt');
  }

  const expectedProject = rawText(input.expectedProjectSlug);
  const projectBindingValid = Boolean(
    receipt && expectedProject && expectedProject.length <= 160 && same(receipt.projectSlug, expectedProject),
  );
  if (!projectBindingValid) errors.push('decision project does not match FCR project context');

  let exactHeadBindingValid = true;
  if (input.requireExactHead === true) {
    const currentHead = rawText(input.currentHeadSha).toLowerCase();
    exactHeadBindingValid = Boolean(
      receipt
      && FULL_SHA.test(receipt.expectedHeadSha)
      && FULL_SHA.test(currentHead)
      && same(receipt.expectedHeadSha, currentHead),
    );
    if (!exactHeadBindingValid) {
      errors.push('decision expected head does not match current FCR project head');
    }
  }

  const founderApprovalPresent = input.founderApproved === true;
  if (!founderApprovalPresent) {
    errors.push('founder approval is required before authority resolution');
  }

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
