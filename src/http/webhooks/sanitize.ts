/**
 * Allowlisted GitHub webhook envelope.
 *
 * The raw webhook body is a large, provider-shaped, effectively unbounded
 * object (sender, organization, installation, full commit lists, review
 * bodies, actor avatar URLs, etc.). Storing it verbatim in `provider_events`
 * means arbitrary un-curated upstream data enters Control Room storage —
 * exactly what GLOBAL_AI.md's data-boundary principle rules out ("Curated
 * operational events may cross project boundaries. Raw content must not.").
 *
 * This allowlist keeps EXACTLY the fields the controllers that read this
 * payload back out of `provider_events` actually use — verified against
 * ChangeProposalController, CheckRunController, and ReleaseController — and
 * drops everything else. Extending a controller to need a new field means
 * extending this allowlist first; the controller will otherwise silently
 * see `undefined`, which is the intended fail-closed behavior.
 */

type JsonRecord = Record<string, unknown>;

function pick(source: unknown, keys: string[]): JsonRecord | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const record = source as JsonRecord;
  const result: JsonRecord = {};
  for (const key of keys) {
    if (key in record) result[key] = record[key];
  }
  return result;
}

export function sanitizeWebhookPayload(eventType: string, payload: JsonRecord): JsonRecord {
  const sanitized: JsonRecord = {};

  const repository = pick(payload['repository'], ['full_name']);
  if (repository) sanitized['repository'] = repository;

  if (typeof payload['action'] === 'string') sanitized['action'] = payload['action'];

  if (eventType === 'pull_request') {
    const pr = payload['pull_request'] as JsonRecord | undefined;
    if (pr) {
      sanitized['pull_request'] = {
        ...pick(pr, ['number', 'title', 'state', 'merged', 'merge_commit_sha', 'html_url', 'updated_at']),
        head: pick(pr['head'], ['sha', 'ref']),
        base: pick(pr['base'], ['ref']),
        user: pick(pr['user'], ['login']),
      };
    }
  }

  if (eventType === 'check_run') {
    const checkRun = pick(payload['check_run'], ['name', 'conclusion', 'head_sha', 'details_url']);
    if (checkRun) sanitized['check_run'] = checkRun;
  }

  if (eventType === 'deployment') {
    const deployment = pick(payload['deployment'], ['id', 'sha', 'environment', 'created_at']);
    if (deployment) sanitized['deployment'] = deployment;
  }

  if (eventType === 'deployment_status') {
    const deploymentStatus = pick(payload['deployment_status'], ['state', 'environment_url', 'updated_at']);
    if (deploymentStatus) sanitized['deployment_status'] = deploymentStatus;
    const deployment = pick(payload['deployment'], ['id', 'sha', 'environment', 'created_at']);
    if (deployment) sanitized['deployment'] = deployment;
  }

  // push / workflow_run carry no controller-read subfields today beyond
  // action/repository, already handled above — nothing further to allow.

  return sanitized;
}
