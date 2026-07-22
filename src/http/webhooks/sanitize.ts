/**
 * Typed, bounded GitHub webhook envelope.
 *
 * The raw webhook body is a large, provider-shaped, effectively unbounded
 * object. Only controller-required operational metadata may cross into
 * `provider_events`. Keys are allowlisted, values are type-checked and bounded,
 * and URLs are stripped of credentials, query parameters, and fragments before
 * persistence.
 */

type JsonRecord = Record<string, unknown>;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HEX_SHA = /^[0-9a-f]{40,64}$/i;

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function boundedString(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(CONTROL_CHARACTERS, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, maximumLength);
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function shaValue(value: unknown): string | undefined {
  const candidate = boundedString(value, 64);
  return candidate && HEX_SHA.test(candidate) ? candidate.toLowerCase() : undefined;
}

function nullableShaValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  return shaValue(value);
}

function timestampValue(value: unknown): string | undefined {
  const candidate = boundedString(value, 64);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : undefined;
}

function safeUrlValue(value: unknown): string | undefined {
  const candidate = boundedString(value, 2_048);
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function setIfDefined(target: JsonRecord, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function sanitizeRepository(value: unknown): JsonRecord | undefined {
  const repository = asRecord(value);
  const fullName = boundedString(repository?.['full_name'], 200);
  if (!fullName || !GITHUB_REPOSITORY.test(fullName)) return undefined;
  return { full_name: fullName };
}

function sanitizePullRequest(value: unknown): JsonRecord | undefined {
  const pullRequest = asRecord(value);
  if (!pullRequest) return undefined;

  const sanitized: JsonRecord = {};
  setIfDefined(sanitized, 'number', positiveInteger(pullRequest['number']));
  setIfDefined(sanitized, 'title', boundedString(pullRequest['title'], 256));
  setIfDefined(sanitized, 'state', boundedString(pullRequest['state'], 32));
  setIfDefined(sanitized, 'merged', booleanValue(pullRequest['merged']));
  setIfDefined(
    sanitized,
    'merge_commit_sha',
    nullableShaValue(pullRequest['merge_commit_sha']),
  );
  setIfDefined(sanitized, 'html_url', safeUrlValue(pullRequest['html_url']));
  setIfDefined(sanitized, 'updated_at', timestampValue(pullRequest['updated_at']));

  const head = asRecord(pullRequest['head']);
  sanitized['head'] = head
    ? {
        sha: shaValue(head['sha']),
        ref: boundedString(head['ref'], 255),
      }
    : undefined;

  const base = asRecord(pullRequest['base']);
  sanitized['base'] = base
    ? { ref: boundedString(base['ref'], 255) }
    : undefined;

  const user = asRecord(pullRequest['user']);
  sanitized['user'] = user
    ? { login: boundedString(user['login'], 100) }
    : undefined;

  return sanitized;
}

function sanitizeCheckRun(value: unknown): JsonRecord | undefined {
  const checkRun = asRecord(value);
  if (!checkRun) return undefined;

  const sanitized: JsonRecord = {};
  setIfDefined(sanitized, 'name', boundedString(checkRun['name'], 255));
  setIfDefined(sanitized, 'conclusion', boundedString(checkRun['conclusion'], 64));
  setIfDefined(sanitized, 'head_sha', shaValue(checkRun['head_sha']));
  setIfDefined(sanitized, 'details_url', safeUrlValue(checkRun['details_url']));
  return sanitized;
}

function deploymentId(value: unknown): number | string | undefined {
  return positiveInteger(value) ?? boundedString(value, 64);
}

function sanitizeDeployment(value: unknown): JsonRecord | undefined {
  const deployment = asRecord(value);
  if (!deployment) return undefined;

  const sanitized: JsonRecord = {};
  setIfDefined(sanitized, 'id', deploymentId(deployment['id']));
  setIfDefined(sanitized, 'sha', shaValue(deployment['sha']));
  setIfDefined(sanitized, 'environment', boundedString(deployment['environment'], 255));
  setIfDefined(sanitized, 'created_at', timestampValue(deployment['created_at']));
  return sanitized;
}

function sanitizeDeploymentStatus(value: unknown): JsonRecord | undefined {
  const status = asRecord(value);
  if (!status) return undefined;

  const sanitized: JsonRecord = {};
  setIfDefined(sanitized, 'state', boundedString(status['state'], 64));
  setIfDefined(
    sanitized,
    'environment_url',
    safeUrlValue(status['environment_url']),
  );
  setIfDefined(sanitized, 'updated_at', timestampValue(status['updated_at']));
  return sanitized;
}

export function sanitizeWebhookPayload(
  eventType: string,
  payload: JsonRecord,
): JsonRecord {
  const sanitized: JsonRecord = {};

  const repository = sanitizeRepository(payload['repository']);
  if (repository) sanitized['repository'] = repository;

  const action = boundedString(payload['action'], 64);
  if (action) sanitized['action'] = action;

  if (eventType === 'pull_request') {
    const pullRequest = sanitizePullRequest(payload['pull_request']);
    if (pullRequest) sanitized['pull_request'] = pullRequest;
  }

  if (eventType === 'check_run') {
    const checkRun = sanitizeCheckRun(payload['check_run']);
    if (checkRun) sanitized['check_run'] = checkRun;
  }

  if (eventType === 'deployment') {
    const deployment = sanitizeDeployment(payload['deployment']);
    if (deployment) sanitized['deployment'] = deployment;
  }

  if (eventType === 'deployment_status') {
    const deploymentStatus = sanitizeDeploymentStatus(payload['deployment_status']);
    if (deploymentStatus) sanitized['deployment_status'] = deploymentStatus;

    const deployment = sanitizeDeployment(payload['deployment']);
    if (deployment) sanitized['deployment'] = deployment;
  }

  // push / workflow_run carry no controller-read subfields today beyond
  // action/repository, already handled above.
  return sanitized;
}
