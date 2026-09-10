import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  type FriendIntakeReceipt,
  type FriendRuntimeProvider,
  type FirstSliceMove,
  type FirstSlicePrivacyChoice,
  type SensitiveCategory,
  type UsefulnessResponse,
  validateFirstSliceRun,
} from '../../chief/firstSliceContracts.js';
import { supabase } from '../../lib/supabaseClient.js';
import {
  assertFriendRuntimeProviderReady,
  createFriendRuntimeRunner,
  FriendRuntimeError,
  type FriendRuntimeInput,
  type FriendRuntimeProvenance,
  type FriendRuntimeResult,
} from '../../mirror/friendRuntime.js';
import type { MirrorIntentTag } from '../../mirror/types.js';
import {
  requireFounder,
  type FounderRequest,
} from '../middleware/requireFounder.js';

type DbRecord = Record<string, unknown>;
type LiveFriendRuntimeProvider = Exclude<FriendRuntimeProvider, 'deterministic'>;
type RunFriendRuntime = (
  provider: FriendRuntimeProvider,
  input: FriendRuntimeInput,
) => Promise<FriendRuntimeResult>;

interface FriendTimelineEvent {
  sourceEventId: string;
  projectId: string;
  founderUserId: string | null;
  eventType: 'friend_intake_completed' | 'friend_intake_failed';
  severity: 'info' | 'error';
  metadata: DbRecord;
}

interface FriendSummaryRecord {
  intakeId: string;
  runId: string;
  founderUserId: string;
  redactedSummary: string;
  runtimeProvider: FriendRuntimeProvider;
  model: string;
  provenanceId: string;
}

interface FriendCompletionRecord {
  timelineEvent: FriendTimelineEvent;
  summary: FriendSummaryRecord | null;
}

interface FriendFeedbackRecord {
  runId: string;
  founderUserId: string;
  response: UsefulnessResponse;
  recordedAt: string;
}

interface FriendLiveBudget {
  requestUsd: number;
  dailyUsd: number;
}

interface FriendInferenceReservationRecord {
  runId: string;
  founderUserId: string;
  provider: LiveFriendRuntimeProvider;
  reservedBudgetUsd: number;
  dailyBudgetUsd: number;
  expiresAt: string;
}

export interface FriendIntakeRouteDependencies {
  runFriendRuntime?: RunFriendRuntime;
  resolveProjectId?: () => Promise<string>;
  resolveCompletedRunFounderId?: (runId: string) => Promise<string | null>;
  writeTimelineEvent?: (event: FriendTimelineEvent) => Promise<string>;
  writeCompletion?: (record: FriendCompletionRecord) => Promise<string>;
  writeFeedback?: (record: FriendFeedbackRecord) => Promise<void>;
  reserveLiveInference?: (record: FriendInferenceReservationRecord) => Promise<string>;
  resolveLiveInferenceBudget?: () => FriendLiveBudget | null;
  isInteractiveFounderRequest?: (req: FounderRequest) => boolean;
  preflightLiveInference?: (provider: LiveFriendRuntimeProvider) => void;
}

function recordBody(value: unknown): DbRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as DbRecord
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function optionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return boundedString(value, maxLength) ?? undefined;
}

function privacyChoice(value: unknown): Exclude<FirstSlicePrivacyChoice, 'cancel'> | null {
  return value === 'process_without_saving' || value === 'save_redacted_summary'
    ? value
    : null;
}

function runtimeProvider(value: unknown): FriendRuntimeProvider | null {
  if (value === undefined || value === null || value === '') return 'deterministic';
  return value === 'deterministic'
    || value === 'openai'
    || value === 'anthropic'
    || value === 'perplexity'
    ? value
    : null;
}

function usefulnessResponse(value: unknown): UsefulnessResponse | null {
  return value === 'yes' || value === 'not_really' || value === 'wrong_time'
    ? value
    : null;
}

const INTERNATIONAL_PHONE_PATTERN = /\+\d(?:[\s().-]*\d){7,14}\b/;
const AWS_ACCESS_KEY_ID_PATTERN = /\b(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/i;
const PRIVATE_IDENTIFIER_PATTERN = new RegExp(
  `(?:${INTERNATIONAL_PHONE_PATTERN.source}|${AWS_ACCESS_KEY_ID_PATTERN.source}|\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b|\\b(?:\\+?1[-.\\s]?)?(?:\\(\\d{3}\\)|\\d{3})[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b|\\b\\d{3}-\\d{2}-\\d{4}\\b|\\b(?:sk(?:-proj)?|pk|rk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{8,}\\b|\\b(?:routing|account|acct|card)(?:\\s+(?:number|no\\.?))?\\s*[:=#-]?\\s*\\d{4,19}\\b|\\b(?:\\d[ -]*?){13,19}\\b)`,
  'i',
);

export function detectSensitiveCategories(value: string): SensitiveCategory[] {
  const categories: SensitiveCategory[] = [];
  const rules: Array<[SensitiveCategory, RegExp]> = [
    ['credentials', /\b(password|passcode|credential|api[_ -]?key|service[_ -]?role|private[_ -]?key|bearer[_ -]?token|access[_ -]?token|secret)\b/i],
    ['legal', /\b(legal|lawyer|attorney|court|lawsuit|custody|charges?|arrest|police)\b/i],
    ['health', /\b(health|medical|doctor|hospital|diagnos\w*|therapy|therapist|medication|pregnan\w*|suicid\w*|self[- ]?harm|hurt myself|kill myself)\b/i],
    ['teen', /\b(teen|minor|underage|under[ -]?18|child|children|kid|kids|school)\b/i],
    ['family_conflict', /\b(family conflict|domestic conflict|custody|fight with (?:my|our) family|argument with (?:my|our) family)\b/i],
  ];

  for (const [category, pattern] of rules) {
    if (pattern.test(value)) categories.push(category);
  }
  if (PRIVATE_IDENTIFIER_PATTERN.test(value) && !categories.includes('credentials')) {
    categories.push('credentials');
  }
  return categories;
}

function sensitiveTags(categories: SensitiveCategory[]): MirrorIntentTag[] {
  const tags: MirrorIntentTag[] = [];
  if (categories.includes('legal')) tags.push('legal');
  if (categories.includes('health')) tags.push('health');
  if (categories.includes('teen') || categories.includes('family_conflict')) tags.push('kids');
  if (categories.includes('credentials')) tags.push('build');
  return tags.length > 0 ? tags.slice(0, 3) : ['rest'];
}

function protectiveResult(categories: SensitiveCategory[]): FriendRuntimeResult {
  const privateIdentifier = categories.includes('credentials');
  const legal = categories.includes('legal');
  const health = categories.includes('health');

  const move: FirstSliceMove = privateIdentifier
    ? {
        kind: 'protective_move',
        text: 'Keep private identifiers and credentials out of external model requests before taking any other action.',
        rationale: 'Private identifiers and credential-shaped input stay local and are not forwarded to an external model.',
        timeEstimateMinutes: null,
        gateWarning: 'No external model call or provider mutation was made.',
      }
    : {
        kind: 'protective_move',
        text: 'Keep this private and write down the one question that must be answered before you take an external action.',
        rationale: legal || health
          ? 'This touches a sensitive area, so Friend stayed local and kept the next step protective.'
          : 'Sensitive family or youth context stays local and does not become a normal execution-oriented move.',
        timeEstimateMinutes: null,
        gateWarning: 'No external model call or external action was made.',
      };

  return {
    mirror: {
      headline: 'Sensitive note kept local',
      summary: 'Friend detected a sensitive category, kept the content out of external model providers, and limited the next step to a protective move.',
    },
    tags: sensitiveTags(categories),
    move,
    provenance: {
      provider: 'deterministic',
      model: 'friend-sensitive-policy-v1',
      responseId: null,
      promptVersion: 'friend-sensitive-policy-v1-2026-09-08',
      providerStorageMode: 'local_only',
      webSearchUsed: false,
    },
    modelExecutionState: 'not_used',
  };
}

export function redactFriendSummary(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted-id]')
    .replace(/\+\d(?:[\s().-]*\d){7,14}\b/g, '[redacted-phone]')
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[redacted-phone]')
    .replace(/\b(?:routing|account|acct|card)(?:\s+(?:number|no\.?))?\s*[:=#-]?\s*\d{4,19}\b/gi, '[redacted-financial]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted-financial]')
    .replace(/\b(?:AKIA|ASIA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/gi, '[redacted-credential]')
    .replace(/\b(?:sk(?:-proj)?|pk|rk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{8,}\b/g, '[redacted-credential]')
    .replace(/\b(password|passcode|api[_ -]?key|access[_ -]?token|bearer[_ -]?token|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .trim()
    .slice(0, 1_200);
}

function configuredLiveInferenceBudget(env: NodeJS.ProcessEnv = process.env): FriendLiveBudget | null {
  const requestUsd = Number(env.FRIEND_LIVE_REQUEST_BUDGET_USD);
  const dailyUsd = Number(env.FRIEND_LIVE_DAILY_BUDGET_USD);
  if (!Number.isFinite(requestUsd) || !Number.isFinite(dailyUsd)) return null;
  if (requestUsd <= 0 || requestUsd > 10 || dailyUsd < requestUsd || dailyUsd > 100) return null;
  return { requestUsd, dailyUsd };
}

async function defaultResolveProjectId(): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', 'founder-control-room')
    .maybeSingle();

  if (error) throw new Error(`FRIEND_PROJECT_LOOKUP_FAILED:${error.message}`);
  const id = data && typeof data.id === 'string' ? data.id.trim() : '';
  if (!id) throw new Error('FRIEND_PROJECT_NOT_REGISTERED');
  return id;
}

async function defaultResolveCompletedRunFounderId(runId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('project_events')
    .select('metadata')
    .eq('source_event_id', runId)
    .eq('event_type', 'friend_intake_completed')
    .eq('screen', 'friend-intake')
    .maybeSingle();

  if (error) throw new Error(`FRIEND_COMPLETED_RUN_LOOKUP_FAILED:${error.code ?? ''}:${error.message}`);
  const metadata = data && typeof data.metadata === 'object' && data.metadata && !Array.isArray(data.metadata)
    ? data.metadata as DbRecord
    : null;
  const founderUserId = metadata && typeof metadata.founder_user_id === 'string'
    ? metadata.founder_user_id.trim()
    : '';
  return founderUserId || null;
}

async function defaultWriteTimelineEvent(event: FriendTimelineEvent): Promise<string> {
  const { data, error } = await supabase
    .from('project_events')
    .insert({
      project_id: event.projectId,
      source_event_id: event.sourceEventId,
      event_type: event.eventType,
      severity: event.severity,
      screen: 'friend-intake',
      metadata: {
        route: 'POST /mirror/friend-intake',
        actor: 'founder',
        founder_user_id: event.founderUserId,
        ...event.metadata,
      },
    })
    .select('id')
    .single();

  if (error) throw new Error(`FRIEND_TIMELINE_WRITE_FAILED:${error.code ?? ''}:${error.message}`);
  const id = data && typeof data.id === 'string' ? data.id : '';
  if (!id) throw new Error('FRIEND_TIMELINE_WRITE_FAILED:NO_EVENT_ID');
  return id;
}

async function defaultReserveLiveInference(record: FriendInferenceReservationRecord): Promise<string> {
  const { data, error } = await supabase.rpc('reserve_friend_inference_budget', {
    p_run_id: record.runId,
    p_founder_user_id: record.founderUserId,
    p_provider: record.provider,
    p_reserved_budget_usd: record.reservedBudgetUsd,
    p_daily_budget_usd: record.dailyBudgetUsd,
    p_expires_at: record.expiresAt,
  });

  if (error) throw new Error(`FRIEND_INFERENCE_RESERVATION_FAILED:${error.code ?? ''}:${error.message}`);
  const id = typeof data === 'string' ? data : '';
  if (!id) throw new Error('FRIEND_INFERENCE_RESERVATION_FAILED:NO_RESERVATION_ID');
  return id;
}

async function defaultWriteCompletion(record: FriendCompletionRecord): Promise<string> {
  const summary = record.summary;
  const { data, error } = await supabase.rpc('record_friend_intake_completion', {
    p_source_event_id: record.timelineEvent.sourceEventId,
    p_project_id: record.timelineEvent.projectId,
    p_founder_user_id: record.timelineEvent.founderUserId,
    p_metadata: record.timelineEvent.metadata,
    p_intake_id: summary?.intakeId ?? null,
    p_redacted_summary: summary?.redactedSummary ?? null,
    p_runtime_provider: summary?.runtimeProvider ?? null,
    p_model: summary?.model ?? null,
    p_provenance_id: summary?.provenanceId ?? null,
  });

  if (error) throw new Error(`FRIEND_COMPLETION_WRITE_FAILED:${error.code ?? ''}:${error.message}`);
  const id = typeof data === 'string' ? data : '';
  if (!id) throw new Error('FRIEND_COMPLETION_WRITE_FAILED:NO_EVENT_ID');
  return id;
}

async function defaultWriteFeedback(record: FriendFeedbackRecord): Promise<void> {
  const { error } = await supabase.from('friend_intake_feedback').insert({
    run_id: record.runId,
    founder_user_id: record.founderUserId,
    response: record.response,
    recorded_at: record.recordedAt,
  });

  if (error) throw new Error(`FRIEND_FEEDBACK_WRITE_FAILED:${error.code ?? ''}:${error.message}`);
}

function providerFailureStatus(error: unknown): number {
  if (!(error instanceof FriendRuntimeError)) return 502;
  if (
    error.code === 'FRIEND_MODELS_DISABLED'
    || error.code === 'FRIEND_PROVIDER_NOT_ALLOWED'
    || error.code.endsWith('_NOT_CONFIGURED')
  ) {
    return 503;
  }
  if (error.executionState === 'timed_out') return 504;
  return 502;
}

function providerFailureBody(error: unknown) {
  const code = error instanceof FriendRuntimeError ? error.code : 'FRIEND_RUNTIME_FAILED';
  const modelExecutionState = error instanceof FriendRuntimeError
    ? error.executionState
    : 'provider_unavailable';
  return {
    error: providerFailureStatus(error) === 503
      ? 'Requested Friend runtime provider is unavailable'
      : 'Friend runtime provider failed',
    code,
    modelExecutionState,
  };
}

function reservationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('FRIEND_INFERENCE_DAILY_BUDGET_EXCEEDED')) {
    return {
      status: 429,
      body: {
        error: 'Friend live-inference daily budget is exhausted',
        code: 'FRIEND_LIVE_DAILY_BUDGET_EXCEEDED',
      },
    };
  }
  return {
    status: 503,
    body: {
      error: 'Friend live-inference budget reservation is unavailable',
      code: 'FRIEND_LIVE_BUDGET_RESERVATION_UNAVAILABLE',
    },
  };
}

export function createFriendIntakeRouter(dependencies: FriendIntakeRouteDependencies = {}) {
  const router = Router();
  const runFriendRuntime = dependencies.runFriendRuntime ?? createFriendRuntimeRunner();
  const resolveProjectId = dependencies.resolveProjectId ?? defaultResolveProjectId;
  const resolveCompletedRunFounderId = dependencies.resolveCompletedRunFounderId ?? defaultResolveCompletedRunFounderId;
  const writeTimelineEvent = dependencies.writeTimelineEvent ?? defaultWriteTimelineEvent;
  const writeCompletion = dependencies.writeCompletion ?? defaultWriteCompletion;
  const writeFeedback = dependencies.writeFeedback ?? defaultWriteFeedback;
  const reserveLiveInference = dependencies.reserveLiveInference ?? defaultReserveLiveInference;
  const resolveLiveInferenceBudget = dependencies.resolveLiveInferenceBudget ?? configuredLiveInferenceBudget;
  const isInteractiveFounderRequest = dependencies.isInteractiveFounderRequest
    ?? ((req: FounderRequest) => req.founderAuthChannel === 'interactive');
  const preflightLiveInference = dependencies.preflightLiveInference
    ?? ((provider: LiveFriendRuntimeProvider) => assertFriendRuntimeProviderReady(provider));

  router.use(requireFounder);

  router.post('/', async (req: FounderRequest, res) => {
    const body = recordBody(req.body);
    if (!body) {
      return res.status(400).json({
        error: 'Friend Intake body must be a JSON object',
        code: 'FRIEND_INVALID_INPUT',
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, 'relatedMemories')) {
      return res.status(400).json({
        error: 'Friend Intake does not accept or retrieve related memories',
        code: 'FRIEND_MEMORY_RETRIEVAL_NOT_ALLOWED',
      });
    }

    const transcript = boundedString(body.transcript, 20_000);
    const selectedPrivacy = privacyChoice(body.privacyChoice);
    const requestedProvider = runtimeProvider(body.provider);
    const timeEnergyContext = optionalString(body.timeEnergyContext, 500);
    const voiceProfile = optionalString(body.voiceProfile, 2_000);

    if (!transcript) {
      return res.status(400).json({
        error: 'transcript is required and must be at most 20000 characters',
        code: 'FRIEND_INVALID_INPUT',
      });
    }
    if (!selectedPrivacy) {
      return res.status(400).json({
        error: 'privacyChoice must be process_without_saving or save_redacted_summary',
        code: 'FRIEND_INVALID_PRIVACY_CHOICE',
      });
    }
    if (!requestedProvider) {
      return res.status(400).json({
        error: 'provider must be deterministic, openai, anthropic, or perplexity',
        code: 'FRIEND_INVALID_PROVIDER',
      });
    }
    if (timeEnergyContext === undefined || voiceProfile === undefined) {
      return res.status(400).json({
        error: 'timeEnergyContext and voiceProfile must be null or bounded strings',
        code: 'FRIEND_INVALID_INPUT',
      });
    }

    const founderUserId = req.founder?.userId ?? null;
    if (!founderUserId) {
      return res.status(401).json({ error: 'Founder identity is required', code: 'FRIEND_FOUNDER_REQUIRED' });
    }

    let projectId: string;
    try {
      projectId = await resolveProjectId();
    } catch {
      return res.status(500).json({
        error: 'Friend project registry is unavailable',
        code: 'FRIEND_PROJECT_UNAVAILABLE',
      });
    }

    const intakeId = randomUUID();
    const runId = randomUUID();
    const provenanceId = randomUUID();
    const sensitiveCategories = detectSensitiveCategories(
      [transcript, timeEnergyContext ?? '', voiceProfile ?? ''].join('\n'),
    );

    let inferenceReservationId: string | null = null;
    if (sensitiveCategories.length === 0 && requestedProvider !== 'deterministic') {
      if (!isInteractiveFounderRequest(req)) {
        return res.status(401).json({
          error: 'Interactive founder session required for live Friend inference',
          code: 'FRIEND_INTERACTIVE_FOUNDER_REQUIRED',
        });
      }

      try {
        preflightLiveInference(requestedProvider);
      } catch (error) {
        return res.status(providerFailureStatus(error)).json(providerFailureBody(error));
      }

      const budget = resolveLiveInferenceBudget();
      if (!budget) {
        return res.status(503).json({
          error: 'Friend live-inference budget is not configured',
          code: 'FRIEND_LIVE_BUDGET_NOT_CONFIGURED',
        });
      }

      try {
        inferenceReservationId = await reserveLiveInference({
          runId,
          founderUserId,
          provider: requestedProvider,
          reservedBudgetUsd: budget.requestUsd,
          dailyBudgetUsd: budget.dailyUsd,
          expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(),
        });
      } catch (error) {
        const failure = reservationFailure(error);
        return res.status(failure.status).json(failure.body);
      }
    }

    let result: FriendRuntimeResult;
    try {
      result = sensitiveCategories.length > 0
        ? protectiveResult(sensitiveCategories)
        : await runFriendRuntime(requestedProvider, {
            transcript,
            timeEnergyContext: timeEnergyContext ?? 'No additional time or energy context provided.',
            voiceProfile,
          });
    } catch (error) {
      const modelExecutionState = error instanceof FriendRuntimeError
        ? error.executionState
        : 'provider_unavailable';
      try {
        await writeTimelineEvent({
          sourceEventId: runId,
          projectId,
          founderUserId,
          eventType: 'friend_intake_failed',
          severity: 'error',
          metadata: {
            stage: 'runtime',
            requested_provider: requestedProvider,
            privacy_choice: selectedPrivacy,
            error_code: error instanceof FriendRuntimeError ? error.code : 'FRIEND_RUNTIME_FAILED',
            model_execution_state: modelExecutionState,
            ...(inferenceReservationId ? { inference_reservation_id: inferenceReservationId } : {}),
          },
        });
      } catch {
        return res.status(500).json({
          error: 'Friend timeline persistence failed',
          code: 'FRIEND_TIMELINE_PERSISTENCE_FAILED',
        });
      }

      return res.status(providerFailureStatus(error)).json(providerFailureBody(error));
    }

    const validation = validateFirstSliceRun({
      mirror: result.mirror,
      tags: result.tags,
      moves: [result.move],
      privacyChoice: selectedPrivacy,
      sensitiveCategories,
      runtimeProvider: result.provenance.provider,
      modelExecutionState: result.modelExecutionState,
      provenanceId,
    });

    if (!validation.ok) {
      return res.status(502).json({
        error: 'Friend runtime result violated the first-slice contract',
        code: `FRIEND_CONTRACT_${validation.code.toUpperCase()}`,
      });
    }

    let completionSummary: FriendSummaryRecord | null = null;
    if (selectedPrivacy === 'save_redacted_summary') {
      const redactedSummary = redactFriendSummary(result.mirror.summary);
      if (!redactedSummary) {
        return res.status(500).json({
          error: 'Friend could not produce a safe redacted summary',
          code: 'FRIEND_REDACTED_SUMMARY_EMPTY',
        });
      }

      completionSummary = {
        intakeId,
        runId,
        founderUserId,
        redactedSummary,
        runtimeProvider: result.provenance.provider,
        model: result.provenance.model,
        provenanceId,
      };
    }

    let timelineEventId: string;
    try {
      timelineEventId = await writeCompletion({
        timelineEvent: {
          sourceEventId: runId,
          projectId,
          founderUserId,
          eventType: 'friend_intake_completed',
          severity: 'info',
          metadata: {
            stage: 'completed',
            requested_provider: requestedProvider,
            runtime_provider: result.provenance.provider,
            model: result.provenance.model,
            model_execution_state: result.modelExecutionState,
            privacy_choice: selectedPrivacy,
            input_persistence: selectedPrivacy === 'process_without_saving'
              ? 'none'
              : 'redacted_summary_only',
            provider_storage_mode: result.provenance.providerStorageMode,
            web_search_used: result.provenance.webSearchUsed,
            provenance_id: provenanceId,
            ...(inferenceReservationId ? { inference_reservation_id: inferenceReservationId } : {}),
          },
        },
        summary: completionSummary,
      });
    } catch {
      try {
        await writeTimelineEvent({
          sourceEventId: runId,
          projectId,
          founderUserId,
          eventType: 'friend_intake_failed',
          severity: 'error',
          metadata: {
            stage: 'completion_persistence',
            requested_provider: requestedProvider,
            runtime_provider: result.provenance.provider,
            privacy_choice: selectedPrivacy,
            error_code: 'FRIEND_COMPLETION_PERSISTENCE_FAILED',
            ...(inferenceReservationId ? { inference_reservation_id: inferenceReservationId } : {}),
          },
        });
      } catch {
        return res.status(500).json({
          error: 'Friend completion and failure-audit persistence are unavailable',
          code: 'FRIEND_TIMELINE_PERSISTENCE_FAILED',
        });
      }

      return res.status(503).json({
        error: 'Friend completion persistence is unavailable',
        code: 'FRIEND_COMPLETION_PERSISTENCE_FAILED',
      });
    }

    const receipt: FriendIntakeReceipt = {
      intakeId,
      runId,
      privacyChoice: selectedPrivacy,
      inputPersistence: selectedPrivacy === 'process_without_saving'
        ? 'none'
        : 'redacted_summary_only',
      mirror: result.mirror,
      intentTags: result.tags,
      move: result.move,
      runtimeProvider: result.provenance.provider,
      modelExecutionState: result.modelExecutionState,
      provenanceId,
      timelineEventId,
      usefulness: null,
    };

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      ...receipt,
      provenance: {
        id: provenanceId,
        source: result.provenance.provider === 'deterministic'
          ? 'deterministic'
          : 'model_inference',
        provider: result.provenance.provider,
        model: result.provenance.model,
        responseId: result.provenance.responseId,
        promptVersion: result.provenance.promptVersion,
        providerStorageMode: result.provenance.providerStorageMode,
        webSearchUsed: result.provenance.webSearchUsed,
        inferenceReservationId,
        doesNotProve: [
          'founder approval beyond this Friend run',
          'external factual truth',
          'provider write outcome',
          'provider billing amount',
          'memory retrieval',
        ],
      } satisfies FriendRuntimeProvenance & {
        id: string;
        source: 'deterministic' | 'model_inference';
        inferenceReservationId: string | null;
        doesNotProve: string[];
      },
    });
  });

  router.post('/:runId/usefulness', async (req: FounderRequest, res) => {
    const body = recordBody(req.body);
    const runId = boundedString(req.params.runId, 80);
    const response = body ? usefulnessResponse(body.response) : null;
    const founderUserId = req.founder?.userId ?? null;

    if (!body || !runId || !response) {
      return res.status(400).json({
        error: 'A valid runId and usefulness response are required',
        code: 'FRIEND_INVALID_USEFULNESS',
      });
    }
    if (!founderUserId) {
      return res.status(401).json({ error: 'Founder identity is required', code: 'FRIEND_FOUNDER_REQUIRED' });
    }

    let completedRunFounderId: string | null;
    try {
      completedRunFounderId = await resolveCompletedRunFounderId(runId);
    } catch {
      return res.status(503).json({
        error: 'Friend completed-run lookup is unavailable',
        code: 'FRIEND_COMPLETED_RUN_LOOKUP_UNAVAILABLE',
      });
    }
    if (!completedRunFounderId || completedRunFounderId !== founderUserId) {
      return res.status(404).json({
        error: 'Completed Friend run not found',
        code: 'FRIEND_COMPLETED_RUN_NOT_FOUND',
      });
    }

    const recordedAt = new Date().toISOString();
    try {
      await writeFeedback({ runId, founderUserId, response, recordedAt });
    } catch (error) {
      const duplicate = error instanceof Error && error.message.includes('23505');
      return res.status(duplicate ? 409 : 503).json({
        error: duplicate
          ? 'Usefulness was already recorded for this Friend run'
          : 'Friend usefulness storage is unavailable',
        code: duplicate
          ? 'FRIEND_USEFULNESS_ALREADY_RECORDED'
          : 'FRIEND_USEFULNESS_STORAGE_UNAVAILABLE',
      });
    }

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      runId,
      usefulness: {
        response,
        recordedAt,
      },
    });
  });

  return router;
}

export const friendIntakeRouter = createFriendIntakeRouter();
