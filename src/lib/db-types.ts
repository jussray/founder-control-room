export interface Lane {
  id: string;
  label: string;
  status: string;
  risk: 'green' | 'yellow' | 'red';
  created_at: string;
  updated_at: string;
}

export interface Mission {
  id: string;
  lane_id: string;
  title: string;
  objective: string;
  definition_of_done: string[];
  rollback: string[];
  status: 'draft' | 'active' | 'blocked' | 'done' | 'cancelled';
  risk: 'green' | 'yellow' | 'red';
  next_action: string | null;
  created_at: string;
  updated_at: string;
  ooda_steps?: OodaStep[];
  evidence?: Evidence[];
}

export interface OodaStep {
  id: string;
  mission_id: string;
  phase: 'observe' | 'orient' | 'decide' | 'act';
  body: string;
  sort_order: number;
}

export interface ControlRoomEvent {
  id: string;
  source: string;
  lane_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  observed_at: string;
}

export interface Evidence {
  id: string;
  mission_id: string | null;
  label: string;
  kind: 'log' | 'screenshot' | 'trace' | 'metric' | 'note';
  verified: boolean;
  artifact: string | null;
  created_at: string;
}

export interface Escalation {
  id: string;
  lane_id: string | null;
  mission_id: string | null;
  blocker: string;
  verified: string | null;
  safest_path: string | null;
  needs: string | null;
  created_at: string;
}
