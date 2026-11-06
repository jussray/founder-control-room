/**
 * Learning OS v1: bounded backend adapter for the independent learning ledger.
 * Uses the already-present FCR Supabase project. No direct provider, merge,
 * deploy, publication, or approval capability is exposed here.
 *
 * The SQL learning_progress RPC makes the child evidence write and transition
 * one transaction; direct read-then-update would allow torn learning states.
 */
import { supabase } from '../lib/supabaseClient.js';
import {
  assertLearningTransition,
  assertCrossMissionApplication,
  type LearningState,
  type LearningOutcome,
} from '../learning-os/lifecycle.js';

export interface RecordEarnedOutcome {
  outcomeId: string;
  originExecutionId: string;
  originMissionId: string;
  originProjectId: string;
  originHeadSha: string;
  domain: string;
  outcomeSummary: string;
  observedBy: 'founder' | 'ci' | 'runtime' | 'browser' | 'provider';
}

interface Progress {
  learningId: string;
  expected: LearningState;
  next: LearningState;
  payload: Record<string, unknown>;
}

function nonblank(value: string, name: string): string {
  if (!value || !value.trim()) throw new Error(`LEARNING_${name}_REQUIRED`);
  return value.trim();
}

export class LearningController {
  readonly name = 'LearningController';
  readonly authority = 'observation-and-knowledge-only' as const;

  async recordOutcome(input: RecordEarnedOutcome): Promise<{ learningId: string; state: LearningState }> {
    const { data, error } = await supabase.from('learning_records').insert({
      outcome_id: input.outcomeId,
      origin_execution_id: input.originExecutionId,
      origin_mission_id: input.originMissionId,
      origin_project_id: input.originProjectId,
      origin_head_sha: input.originHeadSha.toLowerCase(),
      domain: nonblank(input.domain, 'DOMAIN'),
      outcome_summary: nonblank(input.outcomeSummary, 'OUTCOME'),
      observed_by: input.observedBy,
    }).select('id,state').single();
    // The DB independently checks the exact execution, mission, project,
    // outcome, evidence, verification method, and SHA before creating a record.
    if (error || !data) throw new Error(`LEARNING_RECORD_DENIED: ${error?.message ?? 'no write confirmation'}`);
    return { learningId: String(data.id), state: data.state as LearningState };
  }

  private async progress({ learningId, expected, next, payload }: Progress): Promise<LearningState> {
    assertLearningTransition(expected, next);
    const { data, error } = await supabase.rpc('learning_progress', {
      p_id: learningId, p_expected: expected, p_next: next, p_payload: payload,
    });
    if (error || !data) throw new Error(`LEARNING_PROGRESS_DENIED: ${error?.message ?? 'no state receipt'}`);
    if (data.id !== learningId || data.state !== next) {
      throw new Error('LEARNING_PROGRESS_RECEIPT_MISMATCH');
    }
    return data.state as LearningState;
  }

  extractSignal(learningId: string, signal: {
    signalClass: 'surprising' | 'costly' | 'repeatable' | 'contradictory';
    description: string; evidenceRefs: string[];
  }) {
    return this.progress({
      learningId, expected: 'OUTCOME_RECORDED', next: 'SIGNAL_EXTRACTED',
      payload: { signal_class: signal.signalClass, description: signal.description, evidence_refs: signal.evidenceRefs },
    });
  }

  interpret(learningId: string, interpretation: {
    hypothesis: string; confidence: 'low' | 'medium' | 'high'; confidenceBasis: string;
  }) {
    return this.progress({
      learningId, expected: 'SIGNAL_EXTRACTED', next: 'INTERPRETED',
      payload: {
        hypothesis: interpretation.hypothesis,
        confidence: interpretation.confidence,
        confidence_basis: interpretation.confidenceBasis,
      },
    });
  }

  retain(learningId: string) {
    return this.progress({ learningId, expected: 'INTERPRETED', next: 'RETAINED', payload: {} });
  }

  async apply(input: {
    learningId: string;
    originMissionId: string;
    targetMissionId: string;
    originDomain: string;
    targetDomain: string;
    citedByExecutionId: string;
    howApplied: string;
    crossDomainReason?: string;
  }) {
    assertCrossMissionApplication(input);
    return this.progress({
      learningId: input.learningId, expected: 'RETAINED', next: 'APPLIED',
      payload: {
        cited_by_execution_id: input.citedByExecutionId,
        target_domain: input.targetDomain,
        cross_domain_reason: input.crossDomainReason ?? null,
        how_applied: input.howApplied,
      },
    });
    // The DB rechecks that the referenced downstream execution is genuinely
    // successful and belongs to a *different* mission; caller IDs are not authority.
  }

  revise(learningId: string, review: {
    outcome: LearningOutcome;
    demonstratedImprovement: boolean;
    revision: string;
    evidenceRefs: string[];
  }) {
    return this.progress({
      learningId, expected: 'APPLIED', next: 'REVISED',
      payload: {
        outcome: review.outcome,
        demonstrated_improvement: review.demonstratedImprovement,
        revision: review.revision,
        evidence_refs: review.evidenceRefs,
      },
    });
  }

  /**
   * Requires an existing authenticated founder approval in the FCR broker,
   * bound to action=retire_learning and this exact learningId.
   * An agent cannot make that approval exist by calling this function.
   */
  retire(learningId: string, currentState: Exclude<LearningState, 'RETIRED'>, founderPermissionId: string) {
    return this.progress({
      learningId, expected: currentState, next: 'RETIRED',
      payload: { founder_permission_id: founderPermissionId },
    });
  }

  async findApplicable(domain: string, now = new Date().toISOString()) {
    const { data, error } = await supabase.from('learning_records')
      .select('id,outcome_id,origin_mission_id,origin_project_id,domain,state,expires_at,created_at')
      .eq('domain', nonblank(domain, 'DOMAIN'))
      .in('state', ['RETAINED','APPLIED','REVISED'])
      .gt('expires_at', now)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`LEARNING_READ_DENIED: ${error.message}`);
    return { lessons: data ?? [], authorizesExecution: false as const };
  }
}
