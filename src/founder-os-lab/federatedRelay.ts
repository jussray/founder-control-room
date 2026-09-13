import { createHash } from 'node:crypto';

export const FEDERATED_AGENT_RELAY_CONTRACT = 'juss/federated-agent-relay@v1' as const;

export const FEDERATED_AGENT_MEMBERS = [
  'founder-control-room',
  'chief-ai-machine',
  'solcontinuity',
  'promptos',
] as const;

export type FederatedAgentMember = typeof FEDERATED_AGENT_MEMBERS[number];

const MEMBER_REPOSITORIES: Readonly<Record<FederatedAgentMember, string>> = {
  'founder-control-room': 'jussray/founder-control-room',
  'chief-ai-machine': 'jussray/chief-ai-machine',
  solcontinuity: 'jussray/solcontinuity',
  promptos: 'jussray/promptos',
};

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const COOKIE_ID = /^[A-Za-z0-9:_-]{8,300}$/;
const MESSAGE_ID = /^[A-Za-z0-9:._-]{8,200}$/;
const ALLOWED_FIELDS = new Set([
  'contract',
  'messageId',
  'replyToMessageId',
  'from',
  'to',
  'sourceRepository',
  'sourceBranch',
  'sourceHeadSha',
  'targetRepository',
  'targetBranch',
  'targetObservedHeadSha',
  'subject',
  'payload',
  'contextFingerprint',
  'proofCookie',
  'evidenceRefs',
]);

export interface FederatedAgentRelayEnvelope {
  contract: typeof FEDERATED_AGENT_RELAY_CONTRACT;
  messageId: string;
  replyToMessageId?: string;
  from: FederatedAgentMember;
  to: FederatedAgentMember;
  sourceRepository: string;
  sourceBranch: string;
  sourceHeadSha: string;
  targetRepository: string;
  targetBranch: string;
  targetObservedHeadSha: string;
  subject: string;
  payload: string;
  contextFingerprint: string;
  proofCookie: string;
  evidenceRefs: string[];
}

export interface FederatedRelayReceipt {
  contract: typeof FEDERATED_AGENT_RELAY_CONTRACT;
  status: 'accepted';
  messageId: string;
  replyToMessageId: string | null;
  from: FederatedAgentMember;
  to: FederatedAgentMember;
  messageFingerprint: string;
  successorProofCookie: string;
  predecessorProofCookie: string;
  sourceHeadSha: string;
  targetObservedHeadSha: string;
  evidenceRefs: string[];
  executionAuthorized: false;
  authorityTransferred: false;
  approvalCarriedForward: false;
  nextGate: string;
}

export type FederatedRelayParseResult =
  | { ok: true; envelope: FederatedAgentRelayEnvelope }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function isMember(value: unknown): value is FederatedAgentMember {
  return typeof value === 'string'
    && FEDERATED_AGENT_MEMBERS.includes(value as FederatedAgentMember);
}

function parseHttpsRefs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const refs: string[] = [];
  for (const item of value) {
    const candidate = boundedString(item, 2_000);
    if (!candidate) return null;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    if (!refs.includes(parsed.href)) refs.push(parsed.href);
  }
  return refs;
}

export function parseFederatedAgentRelayEnvelope(value: unknown): FederatedRelayParseResult {
  if (!isRecord(value) || Object.keys(value).some((key) => !ALLOWED_FIELDS.has(key))) {
    return { ok: false, error: 'Relay envelope contains unsupported fields.' };
  }

  if (value.contract !== FEDERATED_AGENT_RELAY_CONTRACT) {
    return { ok: false, error: 'Relay contract is missing or unsupported.' };
  }

  if (!isMember(value.from) || !isMember(value.to) || value.from === value.to) {
    return { ok: false, error: 'Relay requires two different members of the federated quartet.' };
  }

  const messageId = boundedString(value.messageId, 200);
  const replyToMessageId = value.replyToMessageId === undefined
    ? undefined
    : boundedString(value.replyToMessageId, 200);
  const sourceRepository = boundedString(value.sourceRepository, 300);
  const sourceBranch = boundedString(value.sourceBranch, 120);
  const sourceHeadSha = boundedString(value.sourceHeadSha, 40)?.toLowerCase() ?? null;
  const targetRepository = boundedString(value.targetRepository, 300);
  const targetBranch = boundedString(value.targetBranch, 120);
  const targetObservedHeadSha = boundedString(value.targetObservedHeadSha, 40)?.toLowerCase() ?? null;
  const subject = boundedString(value.subject, 500);
  const payload = boundedString(value.payload, 12_000);
  const contextFingerprint = boundedString(value.contextFingerprint, 64)?.toLowerCase() ?? null;
  const proofCookie = boundedString(value.proofCookie, 300);
  const evidenceRefs = parseHttpsRefs(value.evidenceRefs);

  if (
    !messageId
    || !MESSAGE_ID.test(messageId)
    || (replyToMessageId !== undefined && (!replyToMessageId || !MESSAGE_ID.test(replyToMessageId)))
    || !sourceRepository
    || !sourceBranch
    || !sourceHeadSha
    || !EXACT_COMMIT_SHA.test(sourceHeadSha)
    || !targetRepository
    || !targetBranch
    || !targetObservedHeadSha
    || !EXACT_COMMIT_SHA.test(targetObservedHeadSha)
    || !subject
    || !payload
    || !contextFingerprint
    || !SHA256.test(contextFingerprint)
    || !proofCookie
    || !COOKIE_ID.test(proofCookie)
    || !evidenceRefs
  ) {
    return { ok: false, error: 'Relay envelope is malformed.' };
  }

  if (sourceRepository !== MEMBER_REPOSITORIES[value.from]) {
    return { ok: false, error: `Source repository does not match ${value.from}.` };
  }
  if (targetRepository !== MEMBER_REPOSITORIES[value.to]) {
    return { ok: false, error: `Target repository does not match ${value.to}.` };
  }

  return {
    ok: true,
    envelope: {
      contract: FEDERATED_AGENT_RELAY_CONTRACT,
      messageId,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      from: value.from,
      to: value.to,
      sourceRepository,
      sourceBranch,
      sourceHeadSha,
      targetRepository,
      targetBranch,
      targetObservedHeadSha,
      subject,
      payload,
      contextFingerprint,
      proofCookie,
      evidenceRefs,
    },
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function acceptFederatedAgentRelay(envelope: FederatedAgentRelayEnvelope): FederatedRelayReceipt {
  const messageFingerprint = sha256(JSON.stringify({
    contract: envelope.contract,
    messageId: envelope.messageId,
    replyToMessageId: envelope.replyToMessageId ?? null,
    from: envelope.from,
    to: envelope.to,
    sourceRepository: envelope.sourceRepository,
    sourceBranch: envelope.sourceBranch,
    sourceHeadSha: envelope.sourceHeadSha,
    targetRepository: envelope.targetRepository,
    targetBranch: envelope.targetBranch,
    targetObservedHeadSha: envelope.targetObservedHeadSha,
    subject: envelope.subject,
    payload: envelope.payload,
    contextFingerprint: envelope.contextFingerprint,
    proofCookie: envelope.proofCookie,
    evidenceRefs: envelope.evidenceRefs,
  }));
  const successorProofCookie = `Q4R:v1:${sha256(`${envelope.proofCookie}:${messageFingerprint}`)}`;

  return {
    contract: FEDERATED_AGENT_RELAY_CONTRACT,
    status: 'accepted',
    messageId: envelope.messageId,
    replyToMessageId: envelope.replyToMessageId ?? null,
    from: envelope.from,
    to: envelope.to,
    messageFingerprint,
    successorProofCookie,
    predecessorProofCookie: envelope.proofCookie,
    sourceHeadSha: envelope.sourceHeadSha,
    targetObservedHeadSha: envelope.targetObservedHeadSha,
    evidenceRefs: [...envelope.evidenceRefs],
    executionAuthorized: false,
    authorityTransferred: false,
    approvalCarriedForward: false,
    nextGate: `Recipient ${envelope.to} must independently re-verify source and target heads, evidence, and local authority before using this message. Any reply must bind replyToMessageId=${envelope.messageId} and emit its own successor proof cookie.`,
  };
}
