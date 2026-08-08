import type { FounderConveyorStage } from './n8nConveyor.js';

export const FOUNDER_CONVEYOR_EVENTS = [
  'run.started',
  'stage.started',
  'stage.blocked',
  'stage.receipt_retained',
  'stage.retried',
  'run.completed',
] as const;

export type FounderConveyorEventName = (typeof FOUNDER_CONVEYOR_EVENTS)[number];

export interface FounderConveyorTelemetryEvent {
  event: FounderConveyorEventName;
  runId: string;
  projectSlug: string;
  stage: FounderConveyorStage;
  expectedHeadSha: string;
  occurredAt: string;
  receiptId?: string;
  reasonCode?: string;
}

export const FOUNDER_CONVEYOR_KPIS = {
  proofBackedCompletionRate: {
    id: 'proof-backed-completion-rate',
    numerator: 'runs with run.completed after retained stage receipts',
    denominator: 'runs with run.started',
    decision: 'Shows whether the conveyor reaches a provable finish instead of merely starting work.',
  },
  medianStageCycleTime: {
    id: 'median-stage-cycle-time',
    definition: 'Median elapsed time from stage.started to stage.receipt_retained for the same run and stage.',
    decision: 'Shows where the conveyor is slow enough to investigate or redesign.',
  },
  blockedStageRate: {
    id: 'blocked-stage-rate',
    numerator: 'stage.blocked events',
    denominator: 'stage.started events',
    decision: 'Shows where work repeatedly stops and needs founder attention.',
  },
} as const;

export const FOUNDER_CONVEYOR_GUARDRAILS = {
  receiptMismatchRate: {
    id: 'receipt-mismatch-rate',
    target: 0,
    definition: 'Receipts whose run/stage/SHA identity does not match the accepted transition.',
  },
  unauthorizedActionAcceptanceRate: {
    id: 'unauthorized-action-acceptance-rate',
    target: 0,
    definition: 'Transitions accepted while merge, deploy, publish, or external-send authority is requested.',
  },
} as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;

export function validateFounderConveyorTelemetryEvent(event: FounderConveyorTelemetryEvent): string[] {
  const reasons: string[] = [];
  if (!FOUNDER_CONVEYOR_EVENTS.includes(event.event)) reasons.push('event is invalid');
  if (!event.runId.trim()) reasons.push('runId is required');
  if (!event.projectSlug.trim()) reasons.push('projectSlug is required');
  if (!FULL_SHA.test(event.expectedHeadSha)) reasons.push('expectedHeadSha must be a full 40-character Git SHA');
  if (Number.isNaN(Date.parse(event.occurredAt))) reasons.push('occurredAt must be an ISO-compatible timestamp');
  if (event.event === 'stage.receipt_retained' && !event.receiptId?.trim()) reasons.push('receiptId is required for retained receipt events');
  if (event.event === 'stage.blocked' && !event.reasonCode?.trim()) reasons.push('reasonCode is required for blocked stage events');
  return reasons;
}
