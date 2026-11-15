import type { ModelExecutionState } from '../model/execution.js';

export type FirstSliceMoveKind =
  | 'tiny_move'
  | 'protective_move'
  | 'clarifying_question';

export type FirstSlicePrivacyChoice =
  | 'process_without_saving'
  | 'save_redacted_summary'
  | 'cancel';

export type FriendRuntimeProvider =
  | 'deterministic'
  | 'openai'
  | 'anthropic'
  | 'perplexity';

export type SensitiveCategory =
  | 'legal'
  | 'health'
  | 'teen'
  | 'family_conflict'
  | 'credentials';

export type UsefulnessResponse = 'yes' | 'not_really' | 'wrong_time';

export interface FirstSliceMove {
  kind: FirstSliceMoveKind;
  text: string;
  rationale?: string | null;
  timeEstimateMinutes: number | null;
  gateWarning: string | null;
}

export interface FirstSliceRun {
  mirror: {
    headline: string;
    summary: string;
  };
  tags: string[];
  moves: FirstSliceMove[];
  privacyChoice: FirstSlicePrivacyChoice;
  sensitiveCategories: SensitiveCategory[];
  runtimeProvider?: FriendRuntimeProvider;
  modelExecutionState: ModelExecutionState;
  provenanceId: string;
}

export interface FriendIntakeReceipt {
  intakeId: string;
  runId: string;
  privacyChoice: Exclude<FirstSlicePrivacyChoice, 'cancel'>;
  inputPersistence: 'none' | 'redacted_summary_only';
  mirror: {
    headline: string;
    summary: string;
  };
  intentTags: string[];
  move: FirstSliceMove;
  runtimeProvider: FriendRuntimeProvider;
  modelExecutionState: ModelExecutionState;
  provenanceId: string;
  timelineEventId: string;
  usefulness:
    | {
        response: UsefulnessResponse;
        recordedAt: string;
      }
    | null;
}

export type FirstSliceValidation =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'exactly_one_move_required'
        | 'sensitive_move_not_protective'
        | 'runtime_model_state_mismatch'
        | 'invalid_tiny_move_duration';
    };

/**
 * First-slice invariant guard. Live model use is allowed only when the selected
 * runtime provider is explicit and the execution state is truthful. Sensitive
 * inputs stay on the local deterministic/protective path.
 */
export function validateFirstSliceRun(run: FirstSliceRun): FirstSliceValidation {
  const runtimeProvider = run.runtimeProvider ?? 'deterministic';

  if (run.moves.length !== 1) return { ok: false, code: 'exactly_one_move_required' };

  const move = run.moves[0];
  if (
    run.sensitiveCategories.length > 0
    && (
      runtimeProvider !== 'deterministic'
      || (move.kind !== 'protective_move' && move.kind !== 'clarifying_question')
    )
  ) {
    return { ok: false, code: 'sensitive_move_not_protective' };
  }

  if (
    (runtimeProvider === 'deterministic'
      && run.modelExecutionState !== 'not_used'
      && run.modelExecutionState !== 'blocked')
    || (runtimeProvider !== 'deterministic' && run.modelExecutionState !== 'succeeded')
  ) {
    return { ok: false, code: 'runtime_model_state_mismatch' };
  }

  if (
    move.kind === 'tiny_move'
    && (
      move.timeEstimateMinutes === null
      || move.timeEstimateMinutes < 5
      || move.timeEstimateMinutes > 15
    )
  ) {
    return { ok: false, code: 'invalid_tiny_move_duration' };
  }

  return { ok: true };
}
