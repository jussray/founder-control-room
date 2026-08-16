import { createHash } from 'node:crypto';

export const REASONING_RUN_CONTRACT = 'fcr/reasoning-run@v1' as const;
export const REASONING_ARTIFACT_CONTRACT = 'fcr/reasoning-artifact@v1' as const;
export const REASONING_WORKFLOW_PRESET = 'juss-v10-deep-audit' as const;
export const INTENT_FINGERPRINT_SCHEME = 'sanitized-operational-intent-sha256' as const;

export const REASONING_STAGE_ORDER = [
  'goal',
  'reality',
  'ultrathink',
  'redteam-premise',
  'lindy',
  'l99',
  'redteam-plan',
  'ooda',
  'billgates',
  'elonmusk',
  'hormozi',
  'product-design',
  'data-analytics',
  'v10',
  'futureyou-me',
  'juss',
  'proof',
  'rollback',
  'next-gate',
  'reobserve',
] as const;

export const REASONING_REQUESTED_MODES = [
  'ultrathink',
  'redteam',
  'ooda',
  'l99',
  'lindy',
  'billgates',
  'elonmusk',
  'hormozi',
  'product-design',
  'data-analytics',
  'v10',
  'futureyou-me',
  'juss',
] as const;

export type ReasoningStageId = typeof REASONING_STAGE_ORDER[number];
export type ReasoningRequestedMode = typeof REASONING_REQUESTED_MODES[number];
export type ReasoningTruth = 'verified' | 'inferred' | 'unknown';
export type ReasoningStageStatus = 'pending' | 'completed' | 'blocked' | 'failed' | 'skipped';
export type ReasoningRunStopReason = 'stable' | 'authority-gate' | 'blocked' | 'v10-complete' | 'continue';
export type ReasoningRunSource = 'chatgpt' | 'system' | 'product-design' | 'data-analytics' | 'other';
export type ReasoningAuthTransport = 'founder-session-cookie' | 'bearer';
export type ReasoningIntentTarget = 'project' | 'portfolio' | 'repository' | 'provider' | 'workflow' | 'other';

export interface ReasoningOperationalIntent {
  goalCode: string;
  targetClass: ReasoningIntentTarget;
  requestedModes: ReasoningRequestedMode[];
}

export interface ReasoningStageInput {
  id: ReasoningStageId;
  status: ReasoningStageStatus;
  truth: ReasoningTruth;
  resultCode: string;
  evidenceRefs?: string[];
  artifactRefs?: string[];
}

export interface ReasoningStageReceipt extends ReasoningStageInput {
  resultFingerprint: string;
}

export interface ReasoningToolInput {
  tool: string;
  operation: string;
  status: 'success' | 'failure' | 'blocked' | 'unknown';
  targetRef: string;
  evidenceRefs?: string[];
  artifactRefs?: string[];
}

export interface ReasoningToolReceipt extends ReasoningToolInput {
  targetFingerprint: string;
}

export interface ReasoningArtifactReceipt {
  artifactId: string;
  kind: 'evidence' | 'diff' | 'test' | 'runtime' | 'analysis' | 'design' | 'data-quality' | 'other';
  mediaType: string;
  sha256: string;
  privacy: 'operational-only';
  ref: string;
}

export interface ReasoningImplementationReceipt {
  repository: string;
  baseSha: string;
  headSha: string;
  changedFilesFingerprint: string;
  branch?: string;
  pullRequest?: number;
}

export interface ReasoningAuthReceipt {
  transport: ReasoningAuthTransport;
  cookieBoundaryContract: 'fcr/cookie-boundary@v1';
  cookieBoundaryFingerprint: string;
  rawCookieValuesStored: false;
}

export interface ReasoningRunInput {
  chainId: string;
  occurredAt: string;
  projectSlug: string;
  repository?: string;
  source: ReasoningRunSource;
  intent: ReasoningOperationalIntent;
  workflowPreset?: typeof REASONING_WORKFLOW_PRESET;
  iteration: number;
  priorReceiptFingerprint?: string;
  stopReason: ReasoningRunStopReason;
  currentHeadSha?: string;
  nextGateCode?: string;
  stages: ReasoningStageInput[];
  tools?: ReasoningToolInput[];
  artifacts?: ReasoningArtifactReceipt[];
  implementation?: ReasoningImplementationReceipt;
  auth: ReasoningAuthReceipt;
}

export interface ReasoningRunReceipt extends Omit<ReasoningRunInput, 'workflowPreset' | 'tools' | 'artifacts' | 'intent' | 'stages'> {
  contract: typeof REASONING_RUN_CONTRACT;
  workflowPreset: typeof REASONING_WORKFLOW_PRESET;
  intent: ReasoningOperationalIntent;
  intentFingerprintScheme: typeof INTENT_FINGERPRINT_SCHEME;
  intentFingerprint: string;
  stages: ReasoningStageReceipt[];
  tools: ReasoningToolReceipt[];
  artifacts: ReasoningArtifactReceipt[];
  receiptFingerprint: string;
  privacy: {
    rawPromptStored: false;
    rawPromptFingerprintStored: false;
    rawChainOfThoughtStored: false;
    rawToolPayloadsStored: false;
    rawCookieValuesStored: false;
  };
  quality: {
    completedStages: number;
    blockedStages: number;
    failedStages: number;
    verifiedStages: number;
    inferredStages: number;
    unknownStages: number;
    toolReceipts: number;
    artifacts: number;
  };
}

export interface ReasoningArtifactEnvelope {
  contract: typeof REASONING_ARTIFACT_CONTRACT;
  path: string;
  mediaType: 'application/json';
  sha256: string;
  receiptFingerprint: string;
  materialized: false;
  content: string;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const CHAIN_ID = /^[A-Za-z0-9._:@-]{1,160}$/;
const PROJECT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const OPERATIONAL_CODE = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/;
const OPERATIONAL_REF = /^[A-Za-z0-9._:@/-]{1,300}$/;
const INTERNAL_ARTIFACT_REF = /^(?:artifact|fcr|github|run):\/\/[A-Za-z0-9._:@/-]{1,460}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const SOURCES = new Set<ReasoningRunSource>(['chatgpt', 'system', 'product-design', 'data-analytics', 'other']);
const STOP_REASONS = new Set<ReasoningRunStopReason>(['stable', 'authority-gate', 'blocked', 'v10-complete', 'continue']);
const STAGE_STATUSES = new Set<ReasoningStageStatus>(['pending', 'completed', 'blocked', 'failed', 'skipped']);
const TRUTHS = new Set<ReasoningTruth>(['verified', 'inferred', 'unknown']);
const TOOL_STATUSES = new Set<ReasoningToolInput['status']>(['success', 'failure', 'blocked', 'unknown']);
const ARTIFACT_KINDS = new Set<ReasoningArtifactReceipt['kind']>([
  'evidence',
  'diff',
  'test',
  'runtime',
  'analysis',
  'design',
  'data-quality',
  'other',
]);
const AUTH_TRANSPORTS = new Set<ReasoningAuthTransport>(['founder-session-cookie', 'bearer']);
const INTENT_TARGETS = new Set<ReasoningIntentTarget>(['project', 'portfolio', 'repository', 'provider', 'workflow', 'other']);
const REQUESTED_MODES = new Set<ReasoningRequestedMode>(REASONING_REQUESTED_MODES);

function text(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARACTERS, ' ').trim().slice(0, maximumLength);
}

function operationalCode(value: unknown, maximumLength = 120): string {
  const candidate = text(value, maximumLength).toLowerCase();
  return OPERATIONAL_CODE.test(candidate) ? candidate : '';
}

function operationalRef(value: unknown): string {
  const candidate = text(value, 300);
  return OPERATIONAL_REF.test(candidate) ? candidate : '';
}

function artifactRef(value: unknown): string {
  const candidate = text(value, 500);
  if (!candidate) return '';

  if (candidate.startsWith('https://')) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
      return url.toString();
    } catch {
      return '';
    }
  }

  return INTERNAL_ARTIFACT_REF.test(candidate) ? candidate : '';
}

function normalizedSha256(value: unknown): string {
  const candidate = text(value, 64).toLowerCase();
  return SHA256.test(candidate) ? candidate : '';
}

function normalizedCommitSha(value: unknown): string {
  const candidate = text(value, 40).toLowerCase();
  return COMMIT_SHA.test(candidate) ? candidate : '';
}

function uniqueRefs(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(operationalRef).filter(Boolean))].sort();
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, canonicalValue(record[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function fingerprintValue(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function cookieBoundaryFingerprint(transport: ReasoningAuthTransport): string {
  return fingerprintValue({
    contract: 'fcr/cookie-boundary@v1',
    manifest: '.security/cookies.json',
    transport,
    rawCookieValuesStored: false,
    sessionSecretsStored: false,
    csrfSecretsStored: false,
  });
}

function normalizeIntent(input: ReasoningOperationalIntent): ReasoningOperationalIntent {
  const requestedModes = Array.isArray(input.requestedModes)
    ? [...new Set(
        input.requestedModes
          .map((mode) => text(mode, 80).toLowerCase())
          .filter((mode): mode is ReasoningRequestedMode => REQUESTED_MODES.has(mode as ReasoningRequestedMode)),
      )].sort()
    : [];

  return {
    goalCode: operationalCode(input.goalCode),
    targetClass: INTENT_TARGETS.has(input.targetClass) ? input.targetClass : 'other',
    requestedModes,
  };
}

export function operationalIntentFingerprint(input: ReasoningOperationalIntent): string {
  return fingerprintValue({
    scheme: INTENT_FINGERPRINT_SCHEME,
    intent: normalizeIntent(input),
  });
}

function normalizeStage(stage: ReasoningStageInput): ReasoningStageReceipt {
  const normalized = {
    id: stage.id,
    status: stage.status,
    truth: stage.truth,
    resultCode: operationalCode(stage.resultCode),
    evidenceRefs: uniqueRefs(stage.evidenceRefs),
    artifactRefs: uniqueRefs(stage.artifactRefs),
  };
  return {
    ...normalized,
    resultFingerprint: fingerprintValue({
      scheme: 'sanitized-stage-result-sha256',
      stage: normalized,
    }),
  };
}

function normalizeTool(tool: ReasoningToolInput): ReasoningToolReceipt {
  const normalized = {
    tool: operationalCode(tool.tool, 100),
    operation: operationalCode(tool.operation, 160),
    status: tool.status,
    targetRef: operationalRef(tool.targetRef),
    evidenceRefs: uniqueRefs(tool.evidenceRefs),
    artifactRefs: uniqueRefs(tool.artifactRefs),
  };
  return {
    ...normalized,
    targetFingerprint: fingerprintValue({
      scheme: 'sanitized-tool-target-sha256',
      tool: normalized.tool,
      operation: normalized.operation,
      targetRef: normalized.targetRef,
    }),
  };
}

function normalizeArtifact(artifact: ReasoningArtifactReceipt): ReasoningArtifactReceipt {
  return {
    artifactId: text(artifact.artifactId, 180),
    kind: artifact.kind,
    mediaType: text(artifact.mediaType, 120),
    sha256: normalizedSha256(artifact.sha256),
    privacy: 'operational-only',
    ref: artifactRef(artifact.ref),
  };
}

function normalizeImplementation(input: ReasoningImplementationReceipt): ReasoningImplementationReceipt {
  return {
    repository: text(input.repository, 200),
    baseSha: normalizedCommitSha(input.baseSha),
    headSha: normalizedCommitSha(input.headSha),
    changedFilesFingerprint: normalizedSha256(input.changedFilesFingerprint),
    ...(input.branch ? { branch: text(input.branch, 255) } : {}),
    ...(typeof input.pullRequest === 'number' ? { pullRequest: input.pullRequest } : {}),
  };
}

function stageOrderErrors(stages: readonly ReasoningStageInput[]): string[] {
  const errors: string[] = [];
  if (stages.length !== REASONING_STAGE_ORDER.length) {
    errors.push(`stages must contain exactly ${REASONING_STAGE_ORDER.length} ordered stages`);
    return errors;
  }
  REASONING_STAGE_ORDER.forEach((expected, index) => {
    if (stages[index]?.id !== expected) errors.push(`stage ${index + 1} must be ${expected}`);
  });
  return errors;
}

export function validateReasoningRun(input: ReasoningRunInput): string[] {
  const errors: string[] = [];
  if (!CHAIN_ID.test(text(input.chainId, 160))) errors.push('chainId is invalid');
  if (!PROJECT_SLUG.test(text(input.projectSlug, 120))) errors.push('projectSlug is invalid');
  if (input.repository !== undefined && !REPOSITORY.test(text(input.repository, 200))) {
    errors.push('repository is invalid');
  }
  if (!text(input.occurredAt, 80) || Number.isNaN(Date.parse(input.occurredAt))) {
    errors.push('occurredAt must be an ISO-compatible timestamp');
  }
  if (!SOURCES.has(input.source)) errors.push('source is invalid');
  if (input.workflowPreset !== undefined && input.workflowPreset !== REASONING_WORKFLOW_PRESET) {
    errors.push('workflowPreset is invalid');
  }

  if (!input.intent || typeof input.intent !== 'object' || Array.isArray(input.intent)) {
    errors.push('intent must be a sanitized operational envelope');
  } else {
    if (!operationalCode(input.intent.goalCode)) errors.push('intent.goalCode must be an operational code');
    if (!INTENT_TARGETS.has(input.intent.targetClass)) errors.push('intent.targetClass is invalid');
    if (!Array.isArray(input.intent.requestedModes)) {
      errors.push('intent.requestedModes must be an array');
    } else {
      if (input.intent.requestedModes.length > REASONING_REQUESTED_MODES.length) {
        errors.push('intent.requestedModes contains too many entries');
      }
      for (const mode of input.intent.requestedModes) {
        if (!REQUESTED_MODES.has(mode)) errors.push(`intent requested mode is invalid: ${String(mode)}`);
      }
    }
  }

  if (!Number.isInteger(input.iteration) || input.iteration < 1 || input.iteration > 10) {
    errors.push('iteration must be an integer from 1 through 10');
  }
  if (input.iteration === 1 && input.priorReceiptFingerprint) {
    errors.push('iteration 1 cannot have prior receipt binding');
  }
  if (input.iteration > 1 && !normalizedSha256(input.priorReceiptFingerprint)) {
    errors.push('iterations after 1 require priorReceiptFingerprint');
  }
  if (!STOP_REASONS.has(input.stopReason)) errors.push('stopReason is invalid');
  if (input.iteration < 10 && input.stopReason === 'v10-complete') {
    errors.push('v10-complete is only valid on iteration 10');
  }
  if (input.iteration === 10 && input.stopReason === 'continue') {
    errors.push('iteration 10 cannot continue');
  }
  if (input.currentHeadSha !== undefined && !normalizedCommitSha(input.currentHeadSha)) {
    errors.push('currentHeadSha must be an exact 40-character SHA');
  }
  if (input.currentHeadSha && !input.repository) {
    errors.push('currentHeadSha requires repository identity');
  }
  if (input.nextGateCode !== undefined && !operationalCode(input.nextGateCode, 160)) {
    errors.push('nextGateCode must be an operational code');
  }
  if (!AUTH_TRANSPORTS.has(input.auth.transport)) errors.push('auth transport is invalid');
  if (input.auth.rawCookieValuesStored !== false) errors.push('raw cookie values must never be stored');
  if (input.auth.cookieBoundaryContract !== 'fcr/cookie-boundary@v1') {
    errors.push('cookie boundary contract is invalid');
  }
  if (AUTH_TRANSPORTS.has(input.auth.transport)) {
    const expectedCookieFingerprint = cookieBoundaryFingerprint(input.auth.transport);
    if (normalizedSha256(input.auth.cookieBoundaryFingerprint) !== expectedCookieFingerprint) {
      errors.push('cookieBoundaryFingerprint does not match the declared privacy boundary');
    }
  }

  errors.push(...stageOrderErrors(input.stages));
  for (const stage of input.stages) {
    if (!STAGE_STATUSES.has(stage.status)) errors.push(`${stage.id}: status is invalid`);
    if (!TRUTHS.has(stage.truth)) errors.push(`${stage.id}: truth is invalid`);
    if (!operationalCode(stage.resultCode)) errors.push(`${stage.id}: resultCode is invalid`);
    if ((stage.evidenceRefs?.length ?? 0) !== uniqueRefs(stage.evidenceRefs).length) {
      errors.push(`${stage.id}: evidenceRefs must be unique operational references`);
    }
    if ((stage.artifactRefs?.length ?? 0) !== uniqueRefs(stage.artifactRefs).length) {
      errors.push(`${stage.id}: artifactRefs must be unique operational references`);
    }
  }

  for (const tool of input.tools ?? []) {
    if (!operationalCode(tool.tool, 100)) errors.push('tool name is invalid');
    if (!operationalCode(tool.operation, 160)) errors.push('tool operation is invalid');
    if (!TOOL_STATUSES.has(tool.status)) errors.push('tool status is invalid');
    if (!operationalRef(tool.targetRef)) errors.push('tool targetRef must be an operational reference');
    if ((tool.evidenceRefs?.length ?? 0) !== uniqueRefs(tool.evidenceRefs).length) {
      errors.push('tool evidenceRefs must be unique operational references');
    }
    if ((tool.artifactRefs?.length ?? 0) !== uniqueRefs(tool.artifactRefs).length) {
      errors.push('tool artifactRefs must be unique operational references');
    }
  }

  for (const artifact of input.artifacts ?? []) {
    if (!CHAIN_ID.test(text(artifact.artifactId, 180))) errors.push('artifactId is invalid');
    if (!ARTIFACT_KINDS.has(artifact.kind)) errors.push('artifact kind is invalid');
    if (!text(artifact.mediaType, 120)) errors.push('artifact mediaType is invalid');
    if (!normalizedSha256(artifact.sha256)) errors.push('artifact sha256 is invalid');
    if (!artifactRef(artifact.ref)) errors.push('artifact ref must be a safe artifact URI or HTTPS URL without credentials or query data');
    if (artifact.privacy !== 'operational-only') errors.push('artifact privacy must be operational-only');
  }

  if (input.implementation) {
    if (!REPOSITORY.test(text(input.implementation.repository, 200))) errors.push('implementation repository is invalid');
    if (!normalizedCommitSha(input.implementation.baseSha)) errors.push('implementation baseSha is invalid');
    if (!normalizedCommitSha(input.implementation.headSha)) errors.push('implementation headSha is invalid');
    if (!normalizedSha256(input.implementation.changedFilesFingerprint)) {
      errors.push('implementation changedFilesFingerprint must be sha256');
    }
    if (input.implementation.pullRequest !== undefined
      && (!Number.isInteger(input.implementation.pullRequest) || input.implementation.pullRequest < 1)) {
      errors.push('implementation pullRequest is invalid');
    }
  }

  return [...new Set(errors)];
}

function quality(
  stages: readonly ReasoningStageReceipt[],
  tools: readonly ReasoningToolReceipt[],
  artifacts: readonly ReasoningArtifactReceipt[],
) {
  return {
    completedStages: stages.filter((stage) => stage.status === 'completed').length,
    blockedStages: stages.filter((stage) => stage.status === 'blocked').length,
    failedStages: stages.filter((stage) => stage.status === 'failed').length,
    verifiedStages: stages.filter((stage) => stage.truth === 'verified').length,
    inferredStages: stages.filter((stage) => stage.truth === 'inferred').length,
    unknownStages: stages.filter((stage) => stage.truth === 'unknown').length,
    toolReceipts: tools.length,
    artifacts: artifacts.length,
  };
}

export function createReasoningRunReceipt(input: ReasoningRunInput): ReasoningRunReceipt {
  const errors = validateReasoningRun(input);
  if (errors.length) throw new Error(errors.join('; '));

  const intent = normalizeIntent(input.intent);
  const stages = input.stages.map(normalizeStage);
  const tools = (input.tools ?? []).map(normalizeTool);
  const artifacts = (input.artifacts ?? []).map(normalizeArtifact);
  const auth: ReasoningAuthReceipt = {
    transport: input.auth.transport,
    cookieBoundaryContract: 'fcr/cookie-boundary@v1',
    cookieBoundaryFingerprint: cookieBoundaryFingerprint(input.auth.transport),
    rawCookieValuesStored: false,
  };

  const unsigned = {
    contract: REASONING_RUN_CONTRACT,
    chainId: text(input.chainId, 160),
    occurredAt: new Date(input.occurredAt).toISOString(),
    projectSlug: text(input.projectSlug, 120),
    ...(input.repository ? { repository: text(input.repository, 200) } : {}),
    source: input.source,
    intent,
    intentFingerprintScheme: INTENT_FINGERPRINT_SCHEME,
    intentFingerprint: operationalIntentFingerprint(intent),
    workflowPreset: REASONING_WORKFLOW_PRESET,
    iteration: input.iteration,
    ...(input.priorReceiptFingerprint
      ? { priorReceiptFingerprint: normalizedSha256(input.priorReceiptFingerprint) }
      : {}),
    stopReason: input.stopReason,
    ...(input.currentHeadSha ? { currentHeadSha: normalizedCommitSha(input.currentHeadSha) } : {}),
    ...(input.nextGateCode ? { nextGateCode: operationalCode(input.nextGateCode, 160) } : {}),
    stages,
    tools,
    artifacts,
    ...(input.implementation ? { implementation: normalizeImplementation(input.implementation) } : {}),
    auth,
    privacy: {
      rawPromptStored: false as const,
      rawPromptFingerprintStored: false as const,
      rawChainOfThoughtStored: false as const,
      rawToolPayloadsStored: false as const,
      rawCookieValuesStored: false as const,
    },
    quality: quality(stages, tools, artifacts),
  };

  return {
    ...unsigned,
    receiptFingerprint: fingerprintValue(unsigned),
  };
}

export function createReasoningArtifactEnvelope(receipt: ReasoningRunReceipt): ReasoningArtifactEnvelope {
  const content = `${canonicalJson(receipt)}\n`;
  return {
    contract: REASONING_ARTIFACT_CONTRACT,
    path: `artifacts/reasoning-runs/${receipt.chainId}-v${receipt.iteration}.json`,
    mediaType: 'application/json',
    sha256: createHash('sha256').update(content).digest('hex'),
    receiptFingerprint: receipt.receiptFingerprint,
    materialized: false,
    content,
  };
}
