import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  FirstSliceEngine,
  type DeterministicFriendIntakeInput,
  type DeterministicFriendIntakeResult,
  type RunnablePrivacyChoice,
} from '../../chief/firstSliceEngine.js';
import {
  type FirstSlicePrivacyChoice,
  validateFirstSliceRun,
} from '../../chief/firstSliceContracts.js';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import {
  clearSensitiveSaveReviewReceipt,
  issueSensitiveSaveReviewReceipt,
  readSensitiveSaveReviewReceipt,
  setSensitiveSaveReviewReceipt,
  verifySensitiveSaveReviewReceipt,
} from './friendIntakeReviewReceipt.js';

type DbRecord = Record<string, unknown>;
type RunEngine = (input: DeterministicFriendIntakeInput) => DeterministicFriendIntakeResult;

type PersistRunInput = {
  intakeId: string;
  founderId: string;
  projectId: string;
  privacyChoice: RunnablePrivacyChoice;
  redactedSummary: string | null;
  sensitiveCategories: string[];
  sensitiveSaveReviewed: boolean;
  intentTagIds: string[];
  moveKind: string;
  movePolicy: string;
  moveTimeEstimateMinutes: number | null;
  moveGateWarningCode: string | null;
  modelExecutionState: 'blocked';
  provenanceId: string;
  timelineEventId: string;
};

type RecordUsefulnessInput = {
  runId: string;
  founderId: string;
  projectId: string;
  response: 'yes' | 'not_really' | 'wrong_time';
  eventId: string;
};

export interface FriendIntakeRouteDependencies {
  authMiddleware?: RequestHandler;
  enabled?: () => boolean;
  runEngine?: RunEngine;
  resolveProjectId?: () => Promise<string>;
  persistRun?: (input: PersistRunInput) => Promise<void>;
  recordUsefulness?: (input: RecordUsefulnessInput) => Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rateLimitFriendIntake = rateLimit({
  windowMs: 60 * 1_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
});

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function parsePrivacyChoice(value: unknown): FirstSlicePrivacyChoice | null {
  return value === 'process_without_saving'
    || value === 'save_redacted_summary'
    || value === 'cancel'
    ? value
    : null;
}

function friendIntakeEnabled(): boolean {
  return process.env.FCR_FRIEND_INTAKE_ENABLED?.trim().toLowerCase() === 'true';
}

async function defaultResolveProjectId(): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', 'founder-control-room')
    .maybeSingle();

  if (error) throw new Error(`FRIEND_INTAKE_PROJECT_LOOKUP_FAILED:${error.message}`);
  const id = data && typeof data.id === 'string' ? data.id.trim() : '';
  if (!id) throw new Error('FRIEND_INTAKE_PROJECT_NOT_REGISTERED');
  return id;
}

async function defaultPersistRun(input: PersistRunInput): Promise<void> {
  const { error } = await supabase.rpc('process_friend_intake', {
    p_intake_id: input.intakeId,
    p_founder_id: input.founderId,
    p_project_id: input.projectId,
    p_privacy_choice: input.privacyChoice,
    p_redacted_summary: input.redactedSummary,
    p_sensitive_categories: input.sensitiveCategories,
    p_sensitive_save_reviewed: input.sensitiveSaveReviewed,
    p_intent_tag_ids: input.intentTagIds,
    p_move_kind: input.moveKind,
    p_move_policy: input.movePolicy,
    p_move_time_estimate_minutes: input.moveTimeEstimateMinutes,
    p_move_gate_warning_code: input.moveGateWarningCode,
    p_model_execution_state: input.modelExecutionState,
    p_provenance_id: input.provenanceId,
    p_timeline_event_id: input.timelineEventId,
  });

  if (error) throw new Error(`FRIEND_INTAKE_PERSISTENCE_FAILED:${error.message}`);
}

async function defaultRecordUsefulness(input: RecordUsefulnessInput): Promise<void> {
  const { error } = await supabase.rpc('record_friend_intake_usefulness', {
    p_run_id: input.runId,
    p_founder_id: input.founderId,
    p_project_id: input.projectId,
    p_response: input.response,
    p_event_id: input.eventId,
  });

  if (error) throw new Error(`FRIEND_INTAKE_USEFULNESS_FAILED:${error.message}`);
}

function moveGateWarningCode(result: DeterministicFriendIntakeResult): string | null {
  if (result.move.kind === 'protective_move') return 'sensitive_protective';
  if (result.move.kind === 'clarifying_question') return 'sensitive_clarifying';
  return null;
}

export function createFriendIntakeRouter(dependencies: FriendIntakeRouteDependencies = {}) {
  const router = Router();
  const enabled = dependencies.enabled ?? friendIntakeEnabled;
  const authMiddleware = dependencies.authMiddleware ?? requireFounder;
  const engine = new FirstSliceEngine();
  const runEngine = dependencies.runEngine ?? ((input) => engine.run(input));
  const resolveProjectId = dependencies.resolveProjectId ?? defaultResolveProjectId;
  const persistRun = dependencies.persistRun ?? defaultPersistRun;
  const recordUsefulness = dependencies.recordUsefulness ?? defaultRecordUsefulness;

  router.use(rateLimitFriendIntake);
  router.get('/status', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ enabled: enabled() });
  });

  router.use((req, res, next) => {
    if (!enabled()) {
      return res.status(404).json({ error: 'Friend Intake is not enabled on this runtime' });
    }
    next();
  });
  router.use(authMiddleware);

  router.post('/run', async (req: FounderRequest, res) => {
    const body = req.body as DbRecord;
    const privacyChoice = parsePrivacyChoice(body.privacyChoice);

    if (!privacyChoice) {
      return res.status(400).json({ error: 'privacyChoice is invalid' });
    }

    if (privacyChoice === 'cancel') {
      clearSensitiveSaveReviewReceipt(res);
      res.set('Cache-Control', 'no-store');
      return res.status(200).json({
        status: 'cancelled',
        privacyChoice: 'cancel',
        inputPersistence: 'none',
        timelineEventId: null,
      });
    }

    const rawText = boundedString(body.rawText, 20_000);
    if (!rawText) {
      return res.status(400).json({ error: 'rawText is required and must be at most 20000 characters' });
    }

    const founderId = req.founder?.userId ?? null;
    if (!founderId) {
      return res.status(401).json({ error: 'Founder session required' });
    }

    const provenanceId = randomUUID();
    const result = runEngine({ rawText, privacyChoice });

    const validation = validateFirstSliceRun({
      mirror: result.mirror,
      tags: result.intentTags,
      moves: [result.move],
      privacyChoice,
      sensitiveCategories: result.sensitiveCategories,
      modelExecutionState: 'blocked',
      provenanceId,
    });

    if (!validation.ok) {
      return res.status(500).json({
        error: 'Deterministic Friend Intake contract validation failed',
        code: validation.code,
      });
    }

    const sensitiveSaveConfirmed = body.sensitiveSaveConfirmed === true;
    const isSensitiveSave = privacyChoice === 'save_redacted_summary'
      && result.sensitiveCategories.length > 0;
    let sensitiveSaveReviewed = false;

    if (isSensitiveSave) {
      const reviewReceipt = readSensitiveSaveReviewReceipt(req);
      sensitiveSaveReviewed = sensitiveSaveConfirmed
        && verifySensitiveSaveReviewReceipt(reviewReceipt, founderId, rawText, result);

      if (!sensitiveSaveReviewed) {
        let issuedReceipt: string;
        try {
          issuedReceipt = issueSensitiveSaveReviewReceipt(founderId, rawText, result);
        } catch {
          return res.status(500).json({
            error: 'Sensitive Friend Intake review receipt is unavailable',
            code: 'SENSITIVE_SAVE_REVIEW_RECEIPT_UNAVAILABLE',
          });
        }

        setSensitiveSaveReviewReceipt(res, issuedReceipt);
        res.set('Cache-Control', 'no-store');
        return res.status(409).json({
          error: 'Sensitive Friend Intake save requires explicit founder review',
          code: 'SENSITIVE_SAVE_REVIEW_REQUIRED',
          review: {
            redactedSummary: result.redactedSummary,
            inputPersistence: 'none',
            externalModelCalled: false,
            reviewReceiptIssued: true,
          },
        });
      }
    }

    const intakeId = randomUUID();
    const timelineEventId = randomUUID();
    let projectId: string;
    try {
      projectId = await resolveProjectId();
      const persistDerivedIntake = privacyChoice === 'save_redacted_summary';
      await persistRun({
        intakeId,
        founderId,
        projectId,
        privacyChoice,
        redactedSummary: result.redactedSummary,
        sensitiveCategories: persistDerivedIntake ? result.sensitiveCategories : [],
        sensitiveSaveReviewed,
        intentTagIds: persistDerivedIntake ? result.intentTags : [],
        moveKind: result.move.kind,
        movePolicy: result.move.policy,
        moveTimeEstimateMinutes: result.move.timeEstimateMinutes,
        moveGateWarningCode: moveGateWarningCode(result),
        modelExecutionState: 'blocked',
        provenanceId,
        timelineEventId,
      });
    } catch {
      return res.status(500).json({
        error: 'Friend Intake receipt persistence failed',
        code: 'FRIEND_INTAKE_PERSISTENCE_FAILED',
      });
    }

    clearSensitiveSaveReviewReceipt(res);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      receipt: {
        version: 'friend-intake-v1',
        intakeId,
        runId: intakeId,
        privacyChoice,
        inputPersistence: privacyChoice === 'save_redacted_summary'
          ? 'redacted_summary_only'
          : 'none',
        mirror: result.mirror,
        intentTags: result.intentTags,
        move: {
          kind: result.move.kind,
          actionText: result.move.text,
          timeEstimateMinutes: result.move.timeEstimateMinutes,
          gateWarning: result.move.gateWarning,
        },
        modelExecutionState: 'blocked',
        provenance: {
          id: provenanceId,
          kind: 'deterministic_rule_engine',
          engineVersion: 'first-slice-v1',
          externalModelCalled: false,
          relatedMemoryUsed: false,
        },
        timeline: {
          eventId: timelineEventId,
          contentStored: false,
        },
        usefulness: null,
      },
    });
  });

  router.post('/usefulness', async (req: FounderRequest, res) => {
    const body = req.body as DbRecord;
    const runId = boundedString(body.runId, 64);
    const response = body.response;

    if (!runId || !UUID.test(runId)) {
      return res.status(400).json({ error: 'runId must be a UUID' });
    }
    if (response !== 'yes' && response !== 'not_really' && response !== 'wrong_time') {
      return res.status(400).json({ error: 'response is invalid' });
    }

    const founderId = req.founder?.userId ?? null;
    if (!founderId) {
      return res.status(401).json({ error: 'Founder session required' });
    }

    try {
      const projectId = await resolveProjectId();
      await recordUsefulness({
        runId,
        founderId,
        projectId,
        response,
        eventId: randomUUID(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('friend_intake_run_not_owned')) {
        return res.status(404).json({ error: 'Friend Intake run was not found' });
      }
      return res.status(500).json({
        error: 'Friend Intake usefulness persistence failed',
        code: 'FRIEND_INTAKE_USEFULNESS_FAILED',
      });
    }

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, runId, response });
  });

  return router;
}

export const friendIntakeRouter = createFriendIntakeRouter();
