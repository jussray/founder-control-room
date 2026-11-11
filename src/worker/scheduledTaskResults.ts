export interface NamedScheduledTaskResult {
  name: string;
  result: PromiseSettledResult<unknown>;
}

function reportsFailure(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'status' in value
    && (value as { status?: unknown }).status === 'failed',
  );
}

export function assertScheduledTaskResults(
  tasks: readonly NamedScheduledTaskResult[],
): void {
  for (const task of tasks) {
    if (task.result.status === 'rejected') throw task.result.reason;
    if (reportsFailure(task.result.value)) {
      throw new Error(`scheduled_task_reported_failed:${task.name}`);
    }
  }
}
