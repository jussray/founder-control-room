import type { ModelExecutionState } from '../model/execution.js';

export type FirstSliceMoveKind =
  | 'tiny_move'
  | 'protective_move'
  | 'clarifying_question';

export type FirstSlicePrivacyChoice =
  | 'process_without_saving'
  | 'save_redacted_summary'
  | 'cancel';

export type SensitiveCategory =
  | 'legal'
  | 'health'
  | 'teen'
  | 'family_conflict'
  | 'credentials';

export interface FirstSliceMove {
  kind: FirstSliceMoveKind;
  text: string;
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
  modelExecutionState: ModelExecutionState;
  provenanceId: string;
}

export type FirstSliceValidation =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'exactly_one_move_required'
        | 'sensitive_move_not_protective'
        | 'external_model_not_allowed'
        | 'invalid_tiny_move_duration';
    };

/**
 * Phase 0/first-slice guard. The deterministic first slice must not represent a
 * live model call as successful, and sensitive inputs may not jump directly to
 * a normal tiny move.
 */
export function validateFirstSliceRun(run: FirstSliceRun): FirstSliceValidation {
  if (run.moves.length !== 1) return { ok: false, code: 'exactly_one_move_required' };

  const move = run.moves[0];
  if (
    run.sensitiveCategories.length > 0
    && move.kind !== 'protective_move'
    && move.kind !== 'clarifying_question'
  ) {
    return { ok: false, code: 'sensitive_move_not_protective' };
  }

  if (run.modelExecutionState === 'succeeded') {
    return { ok: false, code: 'external_model_not_allowed' };
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
