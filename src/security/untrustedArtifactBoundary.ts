import { createHash } from 'node:crypto';

export const UNTRUSTED_ARTIFACT_BOUNDARY_CONTRACT = 'juss-v10/untrusted-artifact-boundary@v1' as const;

export const UNTRUSTED_ARTIFACT_SOURCES = [
  'user',
  'retrieval',
  'web',
  'email',
  'ticket',
  'tool_output',
  'file',
  'ocr',
  'image',
] as const;

export const UNTRUSTED_ARTIFACT_SIGNALS = [
  'instruction_override',
  'role_impersonation',
  'secret_exfiltration',
  'tool_invocation',
  'approval_bypass',
  'policy_evasion',
  'encoded_payload',
  'prompt_leak_request',
] as const;

export type UntrustedArtifactSource = (typeof UNTRUSTED_ARTIFACT_SOURCES)[number];
export type UntrustedArtifactSignal = (typeof UNTRUSTED_ARTIFACT_SIGNALS)[number];
export type UntrustedArtifactDisposition = 'allow' | 'quarantine' | 'exclude';

export interface UntrustedArtifact {
  id: string;
  source: UntrustedArtifactSource;
  content: string;
  contentHash: string;
  uri?: string;
  authorId?: string;
}

export interface UntrustedArtifactRisk {
  artifactId: string;
  source: UntrustedArtifactSource;
  contentHash: string;
  score: number;
  signals: UntrustedArtifactSignal[];
  disposition: UntrustedArtifactDisposition;
}

export interface UntrustedArtifactBoundaryResult {
  contract: typeof UNTRUSTED_ARTIFACT_BOUNDARY_CONTRACT;
  observed: boolean;
  artifactCount: number;
  risks: UntrustedArtifactRisk[];
  quarantinedArtifactIds: string[];
  excludedArtifactIds: string[];
  errors: string[];
  plannerInputAllowed: boolean;
  toolOutputReentryRequired: true;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const SOURCE_SET = new Set<string>(UNTRUSTED_ARTIFACT_SOURCES);

const SIGNAL_PATTERNS: ReadonlyArray<readonly [UntrustedArtifactSignal, RegExp]> = [
  ['instruction_override', /\b(ignore|disregard|override|forget)\b.{0,80}\b(previous|prior|system|developer|instructions?)\b/i],
  ['role_impersonation', /\b(system message|developer message|admin instruction|root access)\b/i],
  ['secret_exfiltration', /\b(export|send|upload|exfiltrate|reveal)\b.{0,120}\b(secret|token|api key|password|credential|database)\b/i],
  ['tool_invocation', /\b(call|invoke|run|execute)\b.{0,80}\b(api|tool|command|function|terminal)\b/i],
  ['approval_bypass', /\b(without|skip|bypass)\b.{0,80}\b(approval|confirmation|review|authorization)\b/i],
  ['policy_evasion', /\b(do not mention|hide this|keep this secret|do not log)\b/i],
  ['encoded_payload', /\b(base64|rot13|hex encoded|decode this)\b/i],
  ['prompt_leak_request', /\b(show|reveal|print|repeat)\b.{0,80}\b(system prompt|hidden prompt|developer instructions)\b/i],
];

const SIGNAL_WEIGHTS: Readonly<Record<UntrustedArtifactSignal, number>> = {
  instruction_override: 0.35,
  role_impersonation: 0.25,
  secret_exfiltration: 0.7,
  tool_invocation: 0.25,
  approval_bypass: 0.6,
  policy_evasion: 0.4,
  encoded_payload: 0.15,
  prompt_leak_request: 0.35,
};

function text(value: string): string {
  return value.trim();
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function untrustedArtifactContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function normalizeToolOutputArtifact(input: {
  id: string;
  result: unknown;
  uri?: string;
  authorId?: string;
}): UntrustedArtifact {
  const content = typeof input.result === 'string' ? input.result : stableJson(input.result);
  return {
    id: text(input.id),
    source: 'tool_output',
    content,
    contentHash: untrustedArtifactContentHash(content),
    ...(input.uri ? { uri: input.uri.trim() } : {}),
    ...(input.authorId ? { authorId: input.authorId.trim() } : {}),
  };
}

export function validateUntrustedArtifact(artifact: UntrustedArtifact): string[] {
  const errors: string[] = [];
  const id = text(artifact.id);
  const content = artifact.content;
  const contentHash = text(artifact.contentHash).toLowerCase();

  if (!id) errors.push('untrusted artifact id is required');
  if (id.length > 160) errors.push(`untrusted artifact ${id || '<unknown>'} id exceeds 160 characters`);
  if (!SOURCE_SET.has(artifact.source)) errors.push(`untrusted artifact ${id || '<unknown>'} has unsupported source`);
  if (!content.trim()) errors.push(`untrusted artifact ${id || '<unknown>'} content is required`);
  if (content.length > 50_000) errors.push(`untrusted artifact ${id || '<unknown>'} content exceeds 50000 characters`);
  if (!SHA256.test(contentHash)) {
    errors.push(`untrusted artifact ${id || '<unknown>'} contentHash must be sha256`);
  } else if (untrustedArtifactContentHash(content) !== contentHash) {
    errors.push(`untrusted artifact ${id || '<unknown>'} contentHash does not match content`);
  }

  if (artifact.uri) {
    try {
      const parsed = new URL(artifact.uri);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        errors.push(`untrusted artifact ${id || '<unknown>'} uri must be credential-free https`);
      }
    } catch {
      errors.push(`untrusted artifact ${id || '<unknown>'} uri is invalid`);
    }
  }

  if (artifact.authorId && artifact.authorId.trim().length > 300) {
    errors.push(`untrusted artifact ${id || '<unknown>'} authorId exceeds 300 characters`);
  }

  return errors;
}

export function classifyUntrustedArtifact(artifact: UntrustedArtifact): UntrustedArtifactRisk {
  const signals = SIGNAL_PATTERNS
    .filter(([, pattern]) => pattern.test(artifact.content))
    .map(([signal]) => signal);
  const uniqueSignals = [...new Set(signals)];
  const score = Math.min(
    1,
    uniqueSignals.reduce((total, signal) => total + SIGNAL_WEIGHTS[signal], 0),
  );
  const externalSource = artifact.source !== 'user';
  const excludeThreshold = externalSource ? 0.65 : 0.9;
  const quarantineThreshold = externalSource ? 0.35 : 0.6;
  const disposition: UntrustedArtifactDisposition = score >= excludeThreshold
    ? 'exclude'
    : score >= quarantineThreshold
      ? 'quarantine'
      : 'allow';

  return {
    artifactId: artifact.id.trim(),
    source: artifact.source,
    contentHash: artifact.contentHash.trim().toLowerCase(),
    score,
    signals: uniqueSignals,
    disposition,
  };
}

export function evaluateUntrustedArtifactBoundary(
  artifacts: readonly UntrustedArtifact[] = [],
): UntrustedArtifactBoundaryResult {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const artifact of artifacts) {
    errors.push(...validateUntrustedArtifact(artifact));
    const id = artifact.id.trim();
    if (ids.has(id)) errors.push(`duplicate untrusted artifact id: ${id}`);
    ids.add(id);
  }

  const risks = artifacts.map(classifyUntrustedArtifact);
  const quarantinedArtifactIds = risks
    .filter((risk) => risk.disposition === 'quarantine')
    .map((risk) => risk.artifactId);
  const excludedArtifactIds = risks
    .filter((risk) => risk.disposition === 'exclude')
    .map((risk) => risk.artifactId);

  return {
    contract: UNTRUSTED_ARTIFACT_BOUNDARY_CONTRACT,
    observed: artifacts.length > 0,
    artifactCount: artifacts.length,
    risks,
    quarantinedArtifactIds,
    excludedArtifactIds,
    errors: [...new Set(errors)],
    plannerInputAllowed: errors.length === 0
      && quarantinedArtifactIds.length === 0
      && excludedArtifactIds.length === 0,
    toolOutputReentryRequired: true,
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Future model adapters must use this boundary instead of concatenating raw
 * external text into an instruction channel. The planner in Founder OS Lab
 * currently receives no artifact content at all.
 */
export function renderUntrustedArtifactReference(artifact: UntrustedArtifact): string {
  return [
    `<untrusted_document id="${escapeXml(artifact.id.trim())}" source="${artifact.source}" hash="${artifact.contentHash.toLowerCase()}">`,
    escapeXml(artifact.content),
    '</untrusted_document>',
  ].join('');
}
