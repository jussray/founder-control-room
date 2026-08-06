import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import {
  FOUNDER_SIGNAL_CHANNELS,
  evaluateFounderSignalAutomation,
  type FounderSignalAutomationGrant,
  type FounderSignalCandidate,
  type FounderSignalRepositoryScope,
  type FounderSignalEvidenceReceipt,
  type FounderSignalPolicyResult,
} from '../../lib/founderSignalAutomationPolicy.js';

type JsonRecord = Record<string, unknown>;
type CandidatePayload = Omit<
  FounderSignalCandidate,
  'repository' | 'sourceCommitSha' | 'evidenceReceipt'
>;

const MAX_GRANT_JSON_BYTES = 16 * 1024;
const SECRETISH_PATTERN =
  /(sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+|hooks\.zapier\.com|API[_-]?KEY|SERVICE[_-]?ROLE|PASSWORD|SECRET|TOKEN)/i;
const ALLOWED_CANDIDATE_KEYS = new Set([
  'channel',
  'audienceSegment',
  'proofUrl',
  'who',
  'what',
  'where',
  'when',
  'why',
  'how',
  'recipientId',
  'recipientSpecificWhy',
]);

interface TrustedEvidenceLookup {
  repository: string;
  sourceCommitSha: string;
  proofUrl: string;
}

interface PolicyAuditInput {
  invocationId: string;
  sourceRepository: string;
  sourceCommitSha: string;
  candidate: CandidatePayload;
  evidenceReceipt: FounderSignalEvidenceReceipt | null;
  result: FounderSignalPolicyResult;
}

export interface FounderSignalEngineWriteGateDependencies {
  env?: NodeJS.ProcessEnv;
  loadGrant?: (env: NodeJS.ProcessEnv) => Promise<FounderSignalAutomationGrant | null>;
  resolveTrustedEvidence?: (
    lookup: TrustedEvidenceLookup,
  ) => Promise<FounderSignalEvidenceReceipt | null>;
  writePolicyAudit?: (input: PolicyAuditInput) => Promise<void>;
}

class DuplicatePolicyInvocationError extends Error {
  constructor() {
    super('Duplicate Founder Signal policy invocation blocked');
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rpcId(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function containsSecretLikeMaterial(value: unknown): boolean {
  if (typeof value === 'string') return SECRETISH_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsSecretLikeMaterial);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) => SECRETISH_PATTERN.test(key) || containsSecretLikeMaterial(nested),
  );
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  return boundedText(value, maxLength);
}

function parseHttpsUrl(value: unknown): string | null {
  const text = boundedText(value, 1000);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseCandidate(value: unknown): { value: CandidatePayload | null; errors: string[] } {
  if (!isRecord(value)) {
    return { value: null, errors: ['automationCandidate must be an object'] };
  }

  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!ALLOWED_CANDIDATE_KEYS.has(key)) {
      errors.push(`unexpected automationCandidate field: ${key}`);
    }
  }
  if (containsSecretLikeMaterial(value)) {
    errors.push('automationCandidate must not contain credentials or secret-like material');
  }

  const channel = boundedText(value.channel, 30);
  if (
    !channel ||
    !FOUNDER_SIGNAL_CHANNELS.includes(
      channel as (typeof FOUNDER_SIGNAL_CHANNELS)[number],
    )
  ) {
    errors.push('automationCandidate.channel is not supported');
  }

  const audienceSegment = boundedText(value.audienceSegment, 100);
  if (!audienceSegment) errors.push('automationCandidate.audienceSegment is required');

  const proofUrl = parseHttpsUrl(value.proofUrl);
  if (!proofUrl) errors.push('automationCandidate.proofUrl must be a valid HTTPS URL');

  const recipientId = optionalText(value.recipientId, 200);
  if (value.recipientId !== undefined && value.recipientId !== null && !recipientId) {
    errors.push('automationCandidate.recipientId must be a non-empty string when provided');
  }
  const recipientSpecificWhy = optionalText(value.recipientSpecificWhy, 2000);
  if (
    value.recipientSpecificWhy !== undefined &&
    value.recipientSpecificWhy !== null &&
    !recipientSpecificWhy
  ) {
    errors.push(
      'automationCandidate.recipientSpecificWhy must be a non-empty string when provided',
    );
  }

  if (errors.length > 0 || !channel || !audienceSegment || !proofUrl) {
    return { value: null, errors };
  }

  return {
    value: {
      channel: channel as CandidatePayload['channel'],
      audienceSegment,
      proofUrl,
      who: optionalText(value.who, 2000),
      what: optionalText(value.what, 2000),
      where: optionalText(value.where, 2000),
      when: optionalText(value.when, 2000),
      why: optionalText(value.why, 2000),
      how: optionalText(value.how, 2000),
      recipientId,
      recipientSpecificWhy,
    },
    errors: [],
  };
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array`);
  }
  const values = value.map((entry) => boundedText(entry, 200));
  if (values.some((entry) => !entry)) {
    throw new Error(`${field} must contain non-empty strings`);
  }
  return values as string[];
}

function parseGrant(raw: string): FounderSignalAutomationGrant {
  if (Buffer.byteLength(raw, 'utf8') > MAX_GRANT_JSON_BYTES) {
    throw new Error('FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON exceeds 16 KiB');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON is not valid JSON');
  }
  if (!isRecord(parsed)) {
    throw new Error('Founder Signal automation grant must be an object');
  }

  const id = boundedText(parsed.id, 100);
  if (!id) throw new Error('Founder Signal automation grant id is required');
  if (typeof parsed.enabled !== 'boolean') {
    throw new Error('Founder Signal automation grant enabled must be a boolean');
  }
  if (!Array.isArray(parsed.routes) || parsed.routes.length === 0) {
    throw new Error('Founder Signal automation grant routes must be a non-empty array');
  }

  const routes = parsed.routes.map((route, index) => {
    if (!isRecord(route)) {
      throw new Error(`Founder Signal automation route ${index} is invalid`);
    }
    const channel = boundedText(route.channel, 30);
    const audienceSegment = boundedText(route.audienceSegment, 100);
    if (
      !channel ||
      !FOUNDER_SIGNAL_CHANNELS.includes(
        channel as (typeof FOUNDER_SIGNAL_CHANNELS)[number],
      ) ||
      !audienceSegment
    ) {
      throw new Error(`Founder Signal automation route ${index} is invalid`);
    }
    return {
      channel: channel as (typeof FOUNDER_SIGNAL_CHANNELS)[number],
      audienceSegment,
    };
  });

  const expiresAt = parsed.expiresAt === null ? null : boundedText(parsed.expiresAt, 100);
  if (parsed.expiresAt !== null && !expiresAt) {
    throw new Error('Founder Signal automation grant expiresAt must be null or a string');
  }

  const repositoryScope = parseRepositoryScope(parsed.repositoryScope);
  const repositories =
    parsed.repositories === undefined || parsed.repositories === null
      ? []
      : parseStringArray(parsed.repositories, 'repositories');

  if (!repositoryScope && repositories.length === 0) {
    throw new Error('Founder Signal automation grant requires repositoryScope or repositories');
  }

  return {
    id,
    enabled: parsed.enabled,
    routes,
    repositories,
    repositoryScope,
    approvedRecipientIds: Array.isArray(parsed.approvedRecipientIds)
      ? (parsed.approvedRecipientIds
          .map((entry) => boundedText(entry, 200))
          .filter(Boolean) as string[])
      : [],
    expiresAt,
  };
}

function parseRepositoryScope(value: unknown): FounderSignalRepositoryScope | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || value.mode !== 'all_owned') {
    throw new Error('repositoryScope must use mode all_owned');
  }

  const owner = boundedText(value.owner, 39);
  if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) {
    throw new Error('repositoryScope.owner must be a valid GitHub owner');
  }

  return { mode: 'all_owned', owner };
}

async function defaultLoadGrant(
  env: NodeJS.ProcessEnv,
): Promise<FounderSignalAutomationGrant | null> {
  const raw = env.FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON?.trim();
  return raw ? parseGrant(raw) : null;
}

function exactProofUrls(row: JsonRecord): string[] {
  const urls: string[] = [];
  const runner = isRecord(row.runner) ? row.runner : null;
  const runnerUrl = runner ? boundedText(runner.detailsUrl, 1000) : null;
  if (runnerUrl) urls.push(runnerUrl);

  if (Array.isArray(row.checks)) {
    for (const check of row.checks) {
      const detailsUrl = isRecord(check) ? boundedText(check.detailsUrl, 1000) : null;
      if (detailsUrl) urls.push(detailsUrl);
    }
  }
  return urls;
}

async function defaultResolveTrustedEvidence(
  lookup: TrustedEvidenceLookup,
): Promise<FounderSignalEvidenceReceipt | null> {
  const { data, error } = await supabase
    .from('repository_verification_runs')
    .select(
      'repository_provider,repository_identifier,commit_sha,overall_status,signature_verified,runner,checks,scanned_at',
    )
    .eq('repository_identifier', lookup.repository)
    .eq('commit_sha', lookup.sourceCommitSha)
    .eq('overall_status', 'passed')
    .eq('signature_verified', true)
    .order('scanned_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(`TRUSTED_EVIDENCE_LOOKUP_FAILED:${error.message}`);

  for (const rawRow of data ?? []) {
    const row = rawRow as JsonRecord;
    if (!exactProofUrls(row).includes(lookup.proofUrl)) continue;
    const runner = isRecord(row.runner) ? row.runner : null;
    const rawProvider =
      boundedText(runner?.provider, 50) ?? boundedText(row.repository_provider, 50);
    const provider = rawProvider?.toLowerCase();
    if (provider !== 'github' && provider !== 'cloudflare') continue;

    return {
      verified: true,
      provider,
      repository: lookup.repository,
      sourceCommitSha: lookup.sourceCommitSha,
      proofUrl: lookup.proofUrl,
    };
  }

  return null;
}

async function defaultWritePolicyAudit(input: PolicyAuditInput): Promise<void> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('repo_identifier', input.sourceRepository)
    .maybeSingle();
  if (projectError) {
    throw new Error(`POLICY_PROJECT_LOOKUP_FAILED:${projectError.message}`);
  }
  if (!project?.id) {
    throw new Error(`POLICY_PROJECT_NOT_REGISTERED:${input.sourceRepository}`);
  }

  const { error } = await supabase.from('project_events').insert({
    project_id: project.id,
    source_event_id: `fse-policy:${input.invocationId}`,
    event_type: 'founder_signal_engine_policy_decision',
    severity:
      input.result.decision === 'auto-distribute'
        ? 'info'
        : input.result.decision === 'review-only'
          ? 'warning'
          : 'error',
    screen: 'founder-signal-engine-automation-gate',
    provider: input.evidenceReceipt?.provider ?? 'founder-signal-policy',
    decision: input.result.decision,
    metadata: {
      invocationId: input.invocationId,
      grantId: input.result.grantId,
      reasons: input.result.reasons,
      sourceRepository: input.sourceRepository,
      sourceCommitSha: input.sourceCommitSha,
      channel: input.candidate.channel,
      audienceSegment: input.candidate.audienceSegment,
      proofUrl: input.candidate.proofUrl,
      evidenceProvider: input.evidenceReceipt?.provider ?? null,
      recipientId: input.candidate.recipientId ?? null,
    },
  });
  if (!error) return;
  if ((error as { code?: string }).code === '23505') {
    throw new DuplicatePolicyInvocationError();
  }
  throw new Error(`POLICY_AUDIT_WRITE_FAILED:${error.message}`);
}

function jsonRpcError(
  res: Response,
  status: number,
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): void {
  res.status(status).json({
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

/**
 * Fail-closed authority boundary for Founder Signal Engine publication, sending,
 * and HubSpot mutations. Caller-supplied approval text is never trusted.
 * Standing automation can pass only when a server-held grant and a signed,
 * exact-commit verification record both satisfy the policy evaluator.
 */
export function createFounderSignalEngineWriteGate(
  overrides: FounderSignalEngineWriteGateDependencies = {},
): RequestHandler {
  const env = overrides.env ?? process.env;
  const loadGrant = overrides.loadGrant ?? defaultLoadGrant;
  const resolveTrustedEvidence =
    overrides.resolveTrustedEvidence ?? defaultResolveTrustedEvidence;
  const writePolicyAudit = overrides.writePolicyAudit ?? defaultWritePolicyAudit;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = isRecord(req.body) ? req.body : null;
    if (!body || body.method !== 'tools/call') {
      next();
      return;
    }

    const params = isRecord(body.params) ? body.params : null;
    const args = params && isRecord(params.arguments) ? params.arguments : null;
    if (!args) {
      next();
      return;
    }

    const requestedAction = args.requestedAction;
    const allowHubSpotWrite = args.allowHubSpotWrite === true;
    if (requestedAction !== 'publish_or_send' && !allowHubSpotWrite) {
      next();
      return;
    }

    const id = rpcId(body.id);
    if (boundedText(args.founderApprovalId, 200)) {
      jsonRpcError(res, 403, id, -32003, 'Verified Founder Signal authorization is required', {
        requestedAction,
        allowHubSpotWrite,
        nextGate:
          'Caller-supplied founderApprovalId values are not trusted. Use the configured standing policy with exact-commit evidence, or add a dedicated registry-backed manual approval receipt.',
      });
      return;
    }

    const invocationId = boundedText(args.invocationId, 64);
    const sourceRepository = boundedText(args.sourceRepository, 100);
    const sourceCommitSha = boundedText(args.sourceCommitSha, 40);
    const steeringGrantId = boundedText(args.steeringGrantId, 200);
    if (!invocationId || !sourceRepository || !sourceCommitSha || !steeringGrantId) {
      jsonRpcError(res, 400, id, -32602, 'Invalid standing-policy arguments', [
        'invocationId, sourceRepository, sourceCommitSha, and steeringGrantId are required',
      ]);
      return;
    }

    const parsedCandidate = parseCandidate(args.automationCandidate);
    if (!parsedCandidate.value) {
      jsonRpcError(
        res,
        400,
        id,
        -32602,
        'Invalid automationCandidate',
        parsedCandidate.errors,
      );
      return;
    }

    let grant: FounderSignalAutomationGrant | null;
    try {
      grant = await loadGrant(env);
    } catch (error) {
      jsonRpcError(res, 503, id, -32004, 'Founder Signal automation grant is invalid', {
        detail: error instanceof Error ? error.message : 'Unknown grant configuration failure',
      });
      return;
    }
    if (!grant) {
      jsonRpcError(res, 503, id, -32004, 'Founder Signal automation grant is not configured', {
        nextGate: 'Configure FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON in the Worker secret store.',
      });
      return;
    }

    let evidenceReceipt: FounderSignalEvidenceReceipt | null;
    try {
      evidenceReceipt = await resolveTrustedEvidence({
        repository: sourceRepository,
        sourceCommitSha,
        proofUrl: parsedCandidate.value.proofUrl ?? '',
      });
    } catch (error) {
      jsonRpcError(res, 503, id, -32005, 'Trusted evidence lookup failed', {
        detail: error instanceof Error ? error.message : 'Unknown evidence lookup failure',
      });
      return;
    }

    const candidate: FounderSignalCandidate = {
      repository: sourceRepository,
      sourceCommitSha,
      evidenceReceipt,
      ...parsedCandidate.value,
    };
    const policyResult = evaluateFounderSignalAutomation(grant, candidate);
    if (steeringGrantId !== grant.id) {
      policyResult.decision = 'blocked';
      policyResult.reasons.push('steering grant ID does not match the configured grant');
    }
    if (allowHubSpotWrite && candidate.channel !== 'gmail') {
      policyResult.decision = 'blocked';
      policyResult.reasons.push('HubSpot mutation requires the Gmail investor route');
    }

    try {
      await writePolicyAudit({
        invocationId,
        sourceRepository,
        sourceCommitSha,
        candidate: parsedCandidate.value,
        evidenceReceipt,
        result: policyResult,
      });
    } catch (error) {
      if (error instanceof DuplicatePolicyInvocationError) {
        jsonRpcError(res, 409, id, -32007, 'Duplicate Founder Signal invocation blocked', {
          invocationId,
          nextGate: 'Inspect the retained policy decision and use a new invocationId.',
        });
        return;
      }
      jsonRpcError(res, 503, id, -32006, 'Founder Signal policy audit could not be retained', {
        detail: error instanceof Error ? error.message : 'Unknown policy audit failure',
      });
      return;
    }

    if (policyResult.decision !== 'auto-distribute') {
      jsonRpcError(res, 403, id, -32003, 'Founder Signal automation is not authorized', {
        decision: policyResult.decision,
        grantId: policyResult.grantId,
        reasons: policyResult.reasons,
        nextGate:
          policyResult.decision === 'review-only'
            ? 'Complete the missing proof or 5W1H context and retry with a new invocationId.'
            : 'Repair the grant scope or recipient authorization before retrying.',
      });
      return;
    }

    res.locals.founderSignalAutomationAuthorization = {
      grantId: grant.id,
      invocationId,
    };
    args.founderApprovalId = `standing-policy:${grant.id}:${invocationId}`;
    args.automationCandidate = parsedCandidate.value;
    next();
  };
}

// Compatibility export retained so server wiring and external imports stay stable.
export const requireFounderSignalEngineReviewOnly = createFounderSignalEngineWriteGate();
