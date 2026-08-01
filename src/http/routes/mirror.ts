import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import {
  createOpenAiMirrorRunner,
  MirrorProviderError,
} from '../../mirror/openaiClient.js';
import type {
  MirrorModelResult,
  MirrorRunInput,
  MirrorRunResponse,
} from '../../mirror/types.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

type DbRecord = Record<string, unknown>;

type RunMirror = (input: MirrorRunInput) => Promise<MirrorModelResult>;

type AuditEventType = 'mirror_engine_completed' | 'mirror_engine_failed';

interface MirrorAuditEvent {
  runId: string;
  projectId: string;
  founderUserId: string | null;
  eventType: AuditEventType;
  severity: 'info' | 'error';
  metadata: DbRecord;
}

export interface MirrorRouteDependencies {
  runMirror?: RunMirror;
  resolveProjectId?: () => Promise<string>;
  writeAuditEvent?: (event: MirrorAuditEvent) => Promise<void>;
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

function stringList(
  value: unknown,
  maxItems: number,
  maxItemLength: number,
): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => boundedString(item, maxItemLength));
  return items.some((item) => item === null) ? null : items as string[];
}

function providerErrorCode(error: unknown): string {
  return error instanceof MirrorProviderError ? error.code : 'MIRROR_ENGINE_FAILED';
}

async function defaultResolveProjectId(): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', 'founder-control-room')
    .maybeSingle();

  if (error) throw new Error(`PROJECT_LOOKUP_FAILED:${error.message}`);
  const id = data && typeof data.id === 'string' ? data.id.trim() : '';
  if (!id) throw new Error('PROJECT_NOT_REGISTERED:founder-control-room');
  return id;
}

async function defaultWriteAuditEvent(event: MirrorAuditEvent): Promise<void> {
  const { error } = await supabase.from('project_events').insert({
    project_id: event.projectId,
    source_event_id: event.runId,
    event_type: event.eventType,
    severity: event.severity,
    screen: 'mirror-engine-api',
    metadata: {
      route: 'POST /mirror/run',
      actor: 'founder',
      founder_user_id: event.founderUserId,
      ...event.metadata,
    },
  });
  if (error) throw new Error(`AUDIT_WRITE_FAILED:${error.message}`);
}

export function createMirrorRouter(dependencies: MirrorRouteDependencies = {}) {
  const router = Router();
  const runMirror = dependencies.runMirror ?? createOpenAiMirrorRunner();
  const resolveProjectId = dependencies.resolveProjectId ?? defaultResolveProjectId;
  const writeAuditEvent = dependencies.writeAuditEvent ?? defaultWriteAuditEvent;

  router.use(requireFounder);

  /**
   * POST /mirror/run
   *
   * Runs the founder-only Mirror Engine draft path. It returns one compressed
   * reflection and one tiny move. It never sends, publishes, schedules, merges,
   * deploys, or treats model output as approval. Any external factual claims are
   * surfaced as a fact-check requirement before external use.
   */
  router.post('/run', async (req: FounderRequest, res) => {
    const body = req.body as DbRecord;
    const transcript = boundedString(body.transcript, 20_000);
    const relatedMemories = stringList(body.relatedMemories, 5, 4_000);
    const timeEnergyContext = boundedString(body.timeEnergyContext, 500);
    const recipientContext = optionalString(body.recipientContext, 1_500);
    const voiceProfile = optionalString(body.voiceProfile, 2_000);

    if (!transcript) {
      return res.status(400).json({ error: 'transcript is required and must be at most 20000 characters' });
    }
    if (!relatedMemories) {
      return res.status(400).json({ error: 'relatedMemories must contain at most 5 bounded non-empty strings' });
    }
    if (!timeEnergyContext) {
      return res.status(400).json({ error: 'timeEnergyContext is required and must be at most 500 characters' });
    }
    if (recipientContext === undefined || voiceProfile === undefined) {
      return res.status(400).json({
        error: 'recipientContext and voiceProfile must be null or bounded non-empty strings',
      });
    }

    let projectId: string;
    try {
      projectId = await resolveProjectId();
    } catch {
      return res.status(500).json({
        error: 'Mirror Engine project registry is unavailable',
        code: 'MIRROR_PROJECT_UNAVAILABLE',
      });
    }

    const runId = randomUUID();
    const input: MirrorRunInput = {
      transcript,
      relatedMemories,
      timeEnergyContext,
      recipientContext,
      voiceProfile,
    };

    let result: MirrorModelResult;
    try {
      result = await runMirror(input);
    } catch (error) {
      try {
        await writeAuditEvent({
          runId,
          projectId,
          founderUserId: req.founder?.userId ?? null,
          eventType: 'mirror_engine_failed',
          severity: 'error',
          metadata: {
            stage: 'provider_call',
            transcript_length: transcript.length,
            related_memory_count: relatedMemories.length,
            recipient_context_present: recipientContext !== null,
            voice_profile_present: voiceProfile !== null,
            error_code: providerErrorCode(error),
          },
        });
      } catch {
        return res.status(500).json({
          error: 'Mirror Engine audit persistence failed',
          code: 'AUDIT_PERSISTENCE_FAILED',
        });
      }

      const code = providerErrorCode(error);
      return res.status(code === 'OPENAI_NOT_CONFIGURED' ? 503 : 502).json({
        error: code === 'OPENAI_NOT_CONFIGURED'
          ? 'Mirror Engine model provider is not configured'
          : 'Mirror Engine model provider failed',
        code,
      });
    }

    try {
      await writeAuditEvent({
        runId,
        projectId,
        founderUserId: req.founder?.userId ?? null,
        eventType: 'mirror_engine_completed',
        severity: 'info',
        metadata: {
          stage: 'completed',
          transcript_length: transcript.length,
          related_memory_count: relatedMemories.length,
          recipient_context_present: recipientContext !== null,
          voice_profile_present: voiceProfile !== null,
          intent_tags: result.output.intentTags,
          goal: result.output.goal,
          script_present: result.output.toneGuardedScript !== null,
          fact_claim_count: result.output.factualClaims.length,
          provider: result.provenance.provider,
          model: result.provenance.model,
          response_id: result.provenance.responseId,
          prompt_version: result.provenance.promptVersion,
          provider_storage_disabled: result.provenance.storedByProvider === false,
          distribution_mode: 'draft_only',
        },
      });
    } catch {
      return res.status(500).json({
        error: 'Mirror Engine audit persistence failed',
        code: 'AUDIT_PERSISTENCE_FAILED',
      });
    }

    const response: MirrorRunResponse = {
      version: 'mirror-engine-v1',
      runId,
      ...result.output,
      distribution: {
        mode: 'draft_only',
        factCheckStatus: result.output.containsExternalFactualClaims
          ? 'required_before_external_use'
          : 'not_required',
        externalActionAllowed: false,
      },
      provenance: result.provenance,
    };

    res.set('Cache-Control', 'no-store');
    return res.status(200).json(response);
  });

  return router;
}

export const mirrorRouter = createMirrorRouter();