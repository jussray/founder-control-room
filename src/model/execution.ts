export type ModelExecutionState =
  | 'succeeded'
  | 'degraded'
  | 'blocked'
  | 'timed_out'
  | 'budget_exceeded'
  | 'schema_invalid'
  | 'provider_unavailable';
