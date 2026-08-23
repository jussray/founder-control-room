export type WitnessEventType =
  | 'ci.completed'
  | 'test.passed'
  | 'test.failed'
  | 'deployment.healthy'
  | 'deployment.degraded'
  | 'merge.completed';

export interface WitnessEvent {
  type: WitnessEventType;
  id: string;
  projectId: string;
  subjectRef: string;
  statement: string;
  witnessedBy: {
    type: 'human' | 'service';
    id: string;
  };
  evidenceRef: string;
  observedAt: string;
}
