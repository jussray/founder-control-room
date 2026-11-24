/** Pure projection of an authenticated, sanitized GitHub event; never sends a push. */
type RecordValue = Record<string, unknown>;
export interface FounderNotificationIntent {
  key: string;
  kind: 'workflow_passed' | 'workflow_recovered' | 'pull_request_merged' | 'deployment_succeeded';
  repository: string;
  commitSha: string;
  branch?: string;
  environment?: string;
  occurredAt: string;
  evidenceUrl: string;
  workflowName?: string;
  recoveryEvidenceUrl?: string;
}
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}
function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}
function exactSha(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) && !/^0{40}$/.test(value) ? value.toLowerCase() : null;
}
function label(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= 255 && !/[\x00-\x1f\x7f]/.test(value) ? value : undefined;
}
function time(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export function githubNotificationIntent(eventType: string, payload: RecordValue): FounderNotificationIntent | null {
  const repository = record(payload.repository).full_name;
  if (typeof repository !== 'string' || repository.length > 200 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split('/').some(part => part === '.' || part === '..')) return null;
  const prefix = `github:${repository.toLowerCase()}`;
  const url = `https://github.com/${repository}`;
  if (eventType === 'workflow_run') {
    const run = record(payload.workflow_run);
    const id = positive(run.id), attempt = positive(run.run_attempt), commitSha = exactSha(run.head_sha), occurredAt = time(run.updated_at);
    if (payload.action !== 'completed' || run.status !== 'completed' || run.conclusion !== 'success' || !id || !attempt || !commitSha || !occurredAt) return null;
    return { key: `${prefix}:workflow:${id}:${attempt}`, kind: 'workflow_passed', repository, commitSha, workflowName: label(run.name), branch: label(run.head_branch), occurredAt, evidenceUrl: `${url}/actions/runs/${id}/attempts/${attempt}` };
  }
  if (eventType === 'pull_request') {
    const pr = record(payload.pull_request);
    const id = positive(pr.number), commitSha = exactSha(pr.merge_commit_sha), occurredAt = time(pr.updated_at);
    if (payload.action !== 'closed' || pr.state !== 'closed' || pr.merged !== true || !id || !commitSha || !occurredAt) return null;
    return { key: `${prefix}:pr:${id}:merged`, kind: 'pull_request_merged', repository, commitSha, branch: label(record(pr.base).ref), occurredAt, evidenceUrl: `${url}/pull/${id}` };
  }
  if (eventType === 'deployment_status') {
    const deployment = record(payload.deployment), status = record(payload.deployment_status);
    const id = positive(deployment.id), commitSha = exactSha(deployment.sha), occurredAt = time(status.updated_at), environment = label(deployment.environment);
    if (status.state !== 'success' || !id || !commitSha || !occurredAt || !environment) return null;
    return { key: `${prefix}:deployment:${id}:success`, kind: 'deployment_succeeded', repository, commitSha, environment, occurredAt, evidenceUrl: `${url}/deployments` };
  }
  return null;
}

/** Recovery is based on a previously observed failure, never a rerun number alone. */
export function recoverWorkflowIntent(intent: FounderNotificationIntent, priorPayload: RecordValue): FounderNotificationIntent {
  if (intent.kind !== 'workflow_passed') return intent;
  const prior = record(priorPayload.workflow_run);
  const id = positive(prior.id);
  const attempt = positive(prior.run_attempt);
  const at = time(prior.updated_at);
  const repo = record(priorPayload.repository).full_name;
  if (typeof repo !== 'string' || repo.toLowerCase() !== intent.repository.toLowerCase() ||
      priorPayload.action !== 'completed' || prior.status !== 'completed' ||
      !['failure', 'timed_out', 'startup_failure'].includes(String(prior.conclusion)) ||
      !id || !attempt || !at || Date.parse(at) >= Date.parse(intent.occurredAt) ||
      exactSha(prior.head_sha) !== intent.commitSha) return intent;
  const prefix = 'github:' + intent.repository.toLowerCase() + ':workflow:' + id + ':';
  if (!intent.key.startsWith(prefix)) return intent;
  const currentAttempt = Number(intent.key.slice(prefix.length));
  if (!Number.isSafeInteger(currentAttempt) || currentAttempt !== attempt + 1) return intent;
  return { ...intent, kind: 'workflow_recovered', recoveryEvidenceUrl: 'https://github.com/' + intent.repository + '/actions/runs/' + id + '/attempts/' + attempt };
}
