export type DecisionEventType =
  | 'request.created'
  | 'chief.plan.created'
  | 'decision.recommendation.created'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied';

export interface DecisionEvent {
  type: DecisionEventType;
  id: string;
  projectId: string;
  requestId?: string;
  actorId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}
