// Read-only merge-gate coverage. This report never grants merge or deployment authority.
export const FCR_REQUIRED_RULESET_ID = 20819094;
export const FCR_EXPECTED_REQUIRED_CONTEXT_COUNT = 19;

function safeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function readFcrRequiredRuleset({ repository, token, getJson }) {
  if (repository !== 'jussray/founder-control-room' || !token || typeof getJson !== 'function') {
    throw new Error('FCR_REQUIRED_RULESET_INPUT_INVALID');
  }
  const endpoint = new URL('https://api.github.com/repos/' + repository + '/rulesets/' + FCR_REQUIRED_RULESET_ID);
  const rule = await getJson(endpoint, token);
  const required = rule?.rules?.filter((entry) => entry?.type === 'required_status_checks') ?? [];
  if (rule?.id !== FCR_REQUIRED_RULESET_ID || rule?.target !== 'branch' || rule?.enforcement !== 'active'
    || required.length !== 1 || !Array.isArray(required[0]?.parameters?.required_status_checks)) {
    throw new Error('FCR_REQUIRED_RULESET_UNAVAILABLE_OR_CHANGED');
  }
  const contexts = required[0].parameters.required_status_checks.map((row) => ({
    context: safeName(row?.context),
    integrationId: Number.isSafeInteger(row?.integration_id) ? String(row.integration_id) : null,
  }));
  if (contexts.some((row) => !row.context || !row.integrationId)
    || new Set(contexts.map((row) => row.context + '\u0000' + row.integrationId)).size !== contexts.length) {
    throw new Error('FCR_REQUIRED_RULESET_INVALID_CONTEXTS');
  }
  return { id: rule.id, name: safeName(rule.name), requiredChecks: contexts };
}

export function assessRequiredGate(requiredRule, checks, expectedSha) {
  const required = requiredRule?.requiredChecks;
  const unknown = {
    source: 'github-required-ruleset-and-exact-head-check-runs',
    authority: 'observational_only',
    rulesetId: FCR_REQUIRED_RULESET_ID,
    expectedCount: FCR_EXPECTED_REQUIRED_CONTEXT_COUNT,
    observedCount: null,
    status: 'unknown',
    counts: null,
    rows: [],
  };
  if (!Array.isArray(required)) return unknown;
  const exactSha = safeName(expectedSha).toLowerCase();
  const list = Array.isArray(checks) ? checks : [];
  const rows = required.map(({ context, integrationId }) => {
    const matching = list.filter((run) => run.name === context && run.headSha === exactSha
      && run.appId === integrationId);
    const entry = matching[0];
    const state = matching.length === 0 ? 'missing'
      : matching.length !== 1 ? 'ambiguous'
      : entry.state === 'passed' ? 'passed'
      : entry.state === 'skipped' ? 'skipped'
      : entry.state === 'queued' || entry.state === 'running' ? 'pending'
      : entry.state === 'failed' ? 'failed' : 'unknown';
    return {
      context, integrationId, state,
      observedCheckId: matching.length === 1 ? entry.id : null,
      detailsUrl: matching.length === 1 ? entry.detailsUrl : null,
    };
  });
  const counts = {
    passed: rows.filter((row) => row.state === 'passed').length,
    missing: rows.filter((row) => row.state === 'missing').length,
    skipped: rows.filter((row) => row.state === 'skipped').length,
    pending: rows.filter((row) => row.state === 'pending').length,
    failed: rows.filter((row) => row.state === 'failed').length,
    unknown: rows.filter((row) => row.state === 'unknown' || row.state === 'ambiguous').length,
  };
  return {
    ...unknown,
    observedCount: rows.length,
    status: rows.length !== FCR_EXPECTED_REQUIRED_CONTEXT_COUNT ? 'ruleset_drift'
      : counts.passed === rows.length ? 'covered' : 'blocked',
    counts, rows,
  };
}

export function summarizeSkippedEvidence(checks) {
  return (Array.isArray(checks) ? checks : []).filter((row) => row.state === 'skipped').map((row) => ({
    name: row.name,
    app: row.app,
    conclusion: row.conclusion,
    detailsUrl: row.detailsUrl,
    evidenceOfPassingCheck: false,
    reasonVerified: false,
  }));
}
