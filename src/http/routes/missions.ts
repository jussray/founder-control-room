/**
 * Mission-scoped routes: multitool assignment, Agent Council, Bench, and
 * per-mission Analytics.
 *
 * The legacy Council POST records caller-supplied rounds. The /council/run
 * route executes the governed provider relay in-process and persists its exact
 * lineage receipt. Neither path grants merge, deploy, publish, or provider
 * mutation authority.
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { runCouncilRound, type CouncilConversationRow } from '../../lib/councilRound.js';
import {
  courtWitnessBridgeReadiness,
  dispatchCourtWitnessBridge,
  type CourtWitnessBridgeResult,
} from '../../lib/courtWitnessBridge.js';
import {
  buildCouncilWitnessPacket,
  exactCouncilSourceRef,
  sameCouncilWitnessSubject,
  type CouncilWitnessSubject,
} from '../../lib/councilWitnessPacket.js';
import { OPERATOR_RELAY_PEERS } from '../../lib/operatorRelayConstants.js';
import { createServerOperatorRelayAdapters } from '../../lib/operatorRelayModelProviders.js';
import type { RelayCapability, RelayOperatorId, RelaySensitivity } from '../../lib/operatorRelay.js';
import { supabase } from '../../lib/supabaseClient.js';
import { providerForProject } from '../../providers/providerFactory.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const missionsRouter = Router();
missionsRouter.use(requireFounder);

const RELAY_PEERS = new Set<string>(OPERATOR_RELAY_PEERS);
const RELAY_CAPABILITIES = new Set<RelayCapability>(['research', 'propose', 'review', 'implement']);
const RELAY_SENSITIVITIES = new Set<RelaySensitivity>(['public', 'internal']);
const DEFAULT_COUNCIL_PARTICIPANTS: readonly RelayOperatorId[] = ['codex', 'claude-code', 'muse'];

interface MissionRow {
  id: string;
  project_id: string;
  base_ref: string | null;
  branch_ref: string | null;
}

interface CouncilProjectRow {
  id: string;
  slug: string;
  name: string;
  repo_provider: string;
  repo_identifier: string | null;
}

interface CouncilWitnessRouteResult {
  ok: boolean;
  code: string;
  status: number;
  subject: CourtWitnessSubject | null;
  reasons: string[];
  kody?: Record<string, unknown> | null;
  sol?: Record<string, unknown> | null;
  promptos?: Record<string, unknown> | null;
}

async function findMission(missionId: string): Promise<MissionRow | null> {
  const { data } = await supabase.from('missions').select('id, project_id, base_ref, branch_ref').eq('id', missionId).maybeSingle();
  return data ?? null;
}

async function missionExists(missionId: string): Promise<boolean> {
  return (await findMission(missionId)) !== null;
}

async function findCouncilProject(projectId: string): Promise<CouncilProjectRow | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, repo_provider, repo_identifier')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new Error(`Council project lookup failed: ${error.message}`);
  return data as CouncilProjectRow | null;
}

async function resolveCouncilWitnessSubject(mission: MissionRow): Promise<CouncilWitnessSubject> {
  const project = await findCouncilProject(mission.project_id);
  if (!project) throw new Error('Council project is not registered');
  if (!project.repo_identifier?.trim()) throw new Error('Council project has no repository configured');

  const requestedRef = mission.branch_ref?.trim() || mission.base_ref?.trim() || 'main';
  const provider = providerForProject({
    repo_provider: project.repo_provider,
    slug: project.slug,
    repo_identifier: project.repo_identifier,
  });
  const resolved = await provider.getRef(project.slug, requestedRef);

  return {
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
    repository: project.repo_identifier,
    branch: resolved.name || requestedRef,
    headSha: resolved.commitSha.toLowerCase(),
  };
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nestedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function persistCouncilWitnessAudit(input: {
  projectId: string;
  missionId: string;
  round: number;
  stage: 'preflight' | 'postflight' | 'dispatch';
  subject: CouncilWitnessSubject | null;
  result: CouncilWitnessRouteResult;
}): Promise<boolean> {
  const kody = nestedRecord(input.result.kody);
  const kodyReceipt = nestedRecord(kody?.receipt);
  const sol = nestedRecord(input.result.sol);
  const solMarker = nestedRecord(sol?.marker);
  const promptos = nestedRecord(input.result.promptos);
  const promptosResult = nestedRecord(promptos?.result);

  const { error } = await supabase.from('project_events').insert({
    project_id: input.projectId,
    source_event_id: randomUUID(),
    event_type: input.result.ok
      ? 'council_witness_bridge_completed'
      : 'council_witness_bridge_blocked',
    severity: input.result.ok ? 'info' : 'warning',
    screen: 'control-room-council',
    metadata: {
      route: 'POST /missions/:missionId/council/run',
      stage: input.stage,
      mission_id: input.missionId,
      round: input.round,
      bridge_code: input.result.code,
      repository: input.subject?.repository ?? null,
      branch: input.subject?.branch ?? null,
      head_sha: input.subject?.headSha ?? null,
      kody_receipt_fingerprint: nestedText(kodyReceipt?.receiptFingerprint),
      sol_continuity_fingerprint: nestedText(solMarker?.continuity_fingerprint),
      promptos_workflow_fingerprint: nestedText(promptosResult?.workflowFingerprint),
      reasons: input.result.reasons.slice(0, 8),
      authority: 'evidence-only',
    },
  });
  return !error;
}

function localCouncilWitnessBlock(
  code: 'EVIDENCE_SUBJECT_UNAVAILABLE' | 'EVIDENCE_SUBJECT_MOVED',
  status: number,
  subject: CouncilWitnessSubject | null,
  reason: string,
): CouncilWitnessRouteResult {
  return {
    ok: false,
    code,
    status,
    subject,
    reasons: [reason],
    kody: null,
    sol: null,
    promptos: null,
  };
}

async function nextCouncilRound(missionId: string): Promise<number> {
  const { data: latest } = await supabase
    .from('council_conversations')
    .select('round')
    .eq('mission_id', missionId)
    .order('round', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (latest?.round ?? 0) + 1;
}

/**
 * PATCH /missions/:missionId
 * Body: { builderAgent?, reviewerAgent?, riskLevel? }
 */
missionsRouter.patch('/:missionId', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  const body = req.body as Record<string, unknown>;

  const update: Record<string, unknown> = {};
  if (typeof body['builderAgent'] === 'string') update['builder_agent'] = body['builderAgent'];
  if (typeof body['reviewerAgent'] === 'string') update['reviewer_agent'] = body['reviewerAgent'];
  if (typeof body['riskLevel'] === 'string') update['risk_level'] = body['riskLevel'];

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No recognized fields to update were provided.' });
  }

  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  update['updated_at'] = new Date().toISOString();
  const { data: mission, error } = await supabase
    .from('missions')
    .update(update)
    .eq('id', missionId)
    .select('id, title, status, builder_agent, reviewer_agent, risk_level, updated_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ mission });
});

/** GET /missions/:missionId/council */
missionsRouter.get('/:missionId/council', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  const { data, error } = await supabase
    .from('council_conversations')
    .select('id, round, participants, transcript, outcome, created_at')
    .eq('mission_id', missionId)
    .order('round', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ conversations: data ?? [] });
});

/**
 * POST /missions/:missionId/council
 * Logs one caller-supplied Council round without invoking providers.
 */
missionsRouter.post('/:missionId/council', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  const body = req.body as Record<string, unknown>;

  const participants = body['participants'];
  if (!Array.isArray(participants) || participants.length === 0 || !participants.every((p) => typeof p === 'string')) {
    return res.status(400).json({ error: 'participants must be a non-empty array of strings' });
  }

  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });
  const round = typeof body['round'] === 'number' ? body['round'] : await nextCouncilRound(missionId);

  const { data: conversation, error } = await supabase
    .from('council_conversations')
    .insert({
      mission_id: missionId,
      round,
      participants,
      transcript: body['transcript'] ?? null,
      outcome: typeof body['outcome'] === 'string' ? body['outcome'] : null,
    })
    .select('id, round, participants, transcript, outcome, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ conversation });
});

/**
 * POST /missions/:missionId/council/run
 * Body: { goal, seed?, participants?, capability?, sensitivity?, sourceRef? }
 *
 * Executes a real zero-clipboard Council round. FCR is the transport source of
 * the first hop; every later source is the provider that actually completed the
 * prior hop. Provider failures/blocks persist as interrupted receipts.
 */
missionsRouter.post('/:missionId/council/run', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  const body = req.body as Record<string, unknown>;

  const goal = typeof body['goal'] === 'string' ? body['goal'].trim() : '';
  const seed = typeof body['seed'] === 'string' ? body['seed'].trim() : goal;
  if (!goal || goal.length > 4_000) return res.status(400).json({ error: 'goal must be 1..4000 characters' });
  if (!seed || seed.length > 12_000) return res.status(400).json({ error: 'seed must be 1..12000 characters' });

  let participants: RelayOperatorId[] = [...DEFAULT_COUNCIL_PARTICIPANTS];
  if (body['participants'] !== undefined) {
    const raw = body['participants'];
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > OPERATOR_RELAY_PEERS.length) {
      return res.status(400).json({ error: 'participants must be a non-empty bounded array of Council peers' });
    }
    if (!raw.every((seat) => typeof seat === 'string' && RELAY_PEERS.has(seat))) {
      return res.status(400).json({ error: 'participants contains an unsupported Council peer' });
    }
    participants = raw as RelayOperatorId[];
  }
  if (new Set(participants).size !== participants.length) {
    return res.status(400).json({ error: 'participants cannot contain duplicates' });
  }

  const capability = body['capability'] === undefined ? 'propose' : body['capability'];
  if (typeof capability !== 'string' || !RELAY_CAPABILITIES.has(capability as RelayCapability)) {
    return res.status(400).json({ error: 'capability is unsupported' });
  }

  const sensitivity = body['sensitivity'] === undefined ? 'internal' : body['sensitivity'];
  if (typeof sensitivity !== 'string' || !RELAY_SENSITIVITIES.has(sensitivity as RelaySensitivity)) {
    return res.status(400).json({ error: 'sensitivity must be public or internal for live Council relay' });
  }

  const mission = await findMission(missionId);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });

  const bridgeReadiness = courtWitnessBridgeReadiness(process.env);
  if (bridgeReadiness.enabled && !bridgeReadiness.ready) {
    const blocked = localCouncilWitnessBlock(
      'EVIDENCE_SUBJECT_UNAVAILABLE',
      503,
      null,
      bridgeReadiness.reasons.join('; ') || 'Court witness bridge is not configured',
    );
    const auditPersisted = await persistCouncilWitnessAudit({
      projectId: mission.project_id,
      missionId,
      round: 0,
      stage: 'preflight',
      subject: null,
      result: blocked,
    });
    return res.status(503).set('Cache-Control', 'no-store').json({
      error: 'Court witness bridge is enabled but not ready.',
      code: 'COUNCIL_WITNESS_BRIDGE_NOT_READY',
      witnessBridge: { result: blocked, auditPersisted },
    });
  }

  let subjectBefore: CouncilWitnessSubject | null = null;
  if (bridgeReadiness.enabled) {
    try {
      subjectBefore = await resolveCouncilWitnessSubject(mission);
    } catch (error) {
      const blocked = localCouncilWitnessBlock(
        'EVIDENCE_SUBJECT_UNAVAILABLE',
        503,
        null,
        error instanceof Error ? error.message : 'Council evidence subject could not be resolved',
      );
      const auditPersisted = await persistCouncilWitnessAudit({
        projectId: mission.project_id,
        missionId,
        round: 0,
        stage: 'preflight',
        subject: null,
        result: blocked,
      });
      return res.status(503).set('Cache-Control', 'no-store').json({
        error: 'Council exact evidence subject could not be resolved.',
        code: 'COUNCIL_WITNESS_SUBJECT_UNAVAILABLE',
        witnessBridge: { result: blocked, auditPersisted },
      });
    }
  }

  const round = await nextCouncilRound(missionId);
  const sourceRef = subjectBefore
    ? exactCouncilSourceRef(subjectBefore)
    : typeof body['sourceRef'] === 'string' && body['sourceRef'].trim()
      ? body['sourceRef'].trim()
      : `mission:${missionId}`;
  let conversation: unknown = null;

  try {
    const relay = await runCouncilRound({
      goal,
      initiator: 'fcr',
      sourceRef,
      seed,
      seats: participants.map((operator) => ({ operator, capability: capability as RelayCapability })),
      missionId,
      round,
      sensitivity: sensitivity as RelaySensitivity,
      persist: async (row: CouncilConversationRow) => {
        const { data, error } = await supabase
          .from('council_conversations')
          .insert(row)
          .select('id, round, participants, transcript, outcome, created_at')
          .single();
        if (error) throw new Error(`Council persistence failed: ${error.message}`);
        conversation = data;
      },
    }, createServerOperatorRelayAdapters(process.env));

    if (!bridgeReadiness.enabled || !subjectBefore) {
      return res.status(201).set('Cache-Control', 'no-store').json({ conversation, relay });
    }

    let witnessResult: CouncilWitnessRouteResult;
    let auditStage: 'postflight' | 'dispatch' = 'dispatch';
    let subjectAfter: CouncilWitnessSubject | null = null;

    try {
      const currentMission = await findMission(missionId);
      if (!currentMission) {
        witnessResult = localCouncilWitnessBlock(
          'EVIDENCE_SUBJECT_UNAVAILABLE',
          409,
          subjectBefore,
          'Mission disappeared before the Council witness could be bound.',
        );
        auditStage = 'postflight';
      } else {
        subjectAfter = await resolveCouncilWitnessSubject(currentMission);
        if (!sameCouncilWitnessSubject(subjectBefore, subjectAfter)) {
          witnessResult = localCouncilWitnessBlock(
            'EVIDENCE_SUBJECT_MOVED',
            409,
            subjectAfter,
            'Repository, mission ref, or exact head moved during the Council round; predecessor evidence was not forwarded.',
          );
          auditStage = 'postflight';
        } else {
          const packet = buildCouncilWitnessPacket({
            missionId,
            goal,
            round,
            relay,
            subject: subjectAfter,
            stopCondition: 'Return bounded evidence and compile the next proof gate; perform no mutation.',
          });
          witnessResult = await dispatchCourtWitnessBridge(packet) as CouncilWitnessRouteResult;
        }
      }
    } catch (error) {
      witnessResult = localCouncilWitnessBlock(
        'EVIDENCE_SUBJECT_UNAVAILABLE',
        409,
        subjectAfter ?? subjectBefore,
        error instanceof Error ? error.message : 'Council witness postflight verification failed',
      );
      auditStage = 'postflight';
    }

    const auditPersisted = await persistCouncilWitnessAudit({
      projectId: mission.project_id,
      missionId,
      round,
      stage: auditStage,
      subject: subjectAfter ?? subjectBefore,
      result: witnessResult,
    });

    return res.status(201).set('Cache-Control', 'no-store').json({
      conversation,
      relay,
      witnessBridge: {
        result: witnessResult,
        auditPersisted,
      },
    });
  } catch (error) {
    return res.status(500).set('Cache-Control', 'no-store').json({
      error: error instanceof Error ? error.message : 'Council relay failed.',
      code: 'council_relay_internal_failure',
    });
  }
});

/** GET /missions/:missionId/runs */
missionsRouter.get('/:missionId/runs', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  const { data, error } = await supabase
    .from('agent_runs')
    .select('id, change_proposal_id, runner_profile, checks, status, artifact_ids, started_at, finished_at')
    .eq('mission_id', missionId)
    .order('started_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ runs: data ?? [] });
});

/** GET /missions/:missionId/costs */
missionsRouter.get('/:missionId/costs', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  const { data, error } = await supabase
    .from('agent_costs')
    .select('id, agent_name, provider, model, input_tokens, output_tokens, cost_usd, created_at')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  const totalUsd = (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  return res.json({ costs: data ?? [], totalUsd });
});

/** POST /missions/:missionId/costs */
missionsRouter.post('/:missionId/costs', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  const body = req.body as Record<string, unknown>;

  const agentName = typeof body['agentName'] === 'string' ? body['agentName'].trim() : '';
  if (!agentName) return res.status(400).json({ error: 'agentName is required' });

  const mission = await findMission(missionId);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });

  const { data: cost, error } = await supabase
    .from('agent_costs')
    .insert({
      project_id: mission.project_id,
      mission_id: missionId,
      agent_name: agentName,
      provider: typeof body['provider'] === 'string' ? body['provider'] : null,
      model: typeof body['model'] === 'string' ? body['model'] : null,
      input_tokens: typeof body['inputTokens'] === 'number' ? body['inputTokens'] : 0,
      output_tokens: typeof body['outputTokens'] === 'number' ? body['outputTokens'] : 0,
      cost_usd: typeof body['costUsd'] === 'number' ? body['costUsd'] : 0,
    })
    .select('id, agent_name, provider, model, input_tokens, output_tokens, cost_usd, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ cost });
});
