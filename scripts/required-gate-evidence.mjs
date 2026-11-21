// Read-only merge-gate coverage. This report never grants merge or deployment authority.
export const FCR_REQUIRED_RULESET_ID = 20819094;
export const FCR_EXPECTED_REQUIRED_CONTEXT_COUNT = 19; // legacy observed roster
export const FCR_CANONICAL_REQUIRED_CONTEXTS = ['Required Gate', 'Verify test-ledger contract'];
export const FCR_STRICT_RULESET_NAME = 'Founder Control Room main exact-head gate [strict freshness]';

function safeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredContexts(rule) {
  const statusRules = (rule?.rules ?? []).filter((entry) => entry?.type === 'required_status_checks');
  if (statusRules.length !== 1 || !Array.isArray(statusRules[0]?.parameters?.required_status_checks)) {
    throw new Error('FCR_REQUIRED_RULESET_UNAVAILABLE_OR_CHANGED');
  }
  const contexts = statusRules[0].parameters.required_status_checks.map((row) => ({
    context: safeName(row?.context),
    integrationId: Number.isSafeInteger(row?.integration_id) ? String(row.integration_id) : null,
  }));
  if (contexts.some((row) => !row.context || !row.integrationId)
    || new Set(contexts.map((row) => row.context + '\u0000' + row.integrationId)).size !== contexts.length) {
    throw new Error('FCR_REQUIRED_RULESET_INVALID_CONTEXTS');
  }
  return contexts;
}

export async function readFcrRequiredRuleset({ repository, token, getJson }) {
  if (repository !== 'jussray/founder-control-room' || !token || typeof getJson !== 'function') {
    throw new Error('FCR_REQUIRED_RULESET_INPUT_INVALID');
  }
  const root = 'https://api.github.com/repos/' + repository + '/rulesets';
  const reviewRule = await getJson(new URL(root + '/' + FCR_REQUIRED_RULESET_ID), token);
  if (reviewRule?.id !== FCR_REQUIRED_RULESET_ID || reviewRule?.target !== 'branch'
    || reviewRule?.enforcement !== 'active') {
    throw new Error('FCR_REQUIRED_RULESET_UNAVAILABLE_OR_CHANGED');
  }
  const legacyRules = (reviewRule.rules ?? []).filter((entry) => entry?.type === 'required_status_checks');
  if (legacyRules.length === 1) {
    const contexts = requiredContexts(reviewRule);
    if (contexts.length !== FCR_EXPECTED_REQUIRED_CONTEXT_COUNT) {
      throw new Error('FCR_REQUIRED_RULESET_LEGACY_CONTEXT_DRIFT');
    }
    return { id: reviewRule.id, name: safeName(reviewRule.name), topology: 'legacy_single',
      expectedCount: FCR_EXPECTED_REQUIRED_CONTEXT_COUNT, requiredChecks: contexts };
  }
  // Canonical FCR review and strict freshness are independent rulesets.
  if (legacyRules.length !== 0) throw new Error('FCR_REQUIRED_RULESET_MIXED_TOPOLOGY');
  const list = await getJson(new URL(root + '?per_page=100'), token);
  if (!Array.isArray(list)) throw new Error('FCR_REQUIRED_RULESET_LIST_UNAVAILABLE');
  const matching = list.filter((entry) => entry?.name === FCR_STRICT_RULESET_NAME);
  if (matching.length !== 1 || !Number.isSafeInteger(matching[0]?.id)) {
    throw new Error('FCR_REQUIRED_RULESET_STRICT_MEMBRANE_MISSING');
  }
  const strict = await getJson(new URL(root + '/' + matching[0].id), token);
  const targets = strict?.conditions?.ref_name?.include;
  if (strict?.id !== matching[0].id || strict.name !== FCR_STRICT_RULESET_NAME
    || strict.target !== 'branch' || strict.enforcement !== 'active'
    || !Array.isArray(targets)
    || !targets.some((name) => name === '~DEFAULT_BRANCH' || name === 'refs/heads/main')
    || strict.rules?.length !== 1 || strict.rules[0]?.type !== 'required_status_checks'
    || strict.rules[0]?.parameters?.strict_required_status_checks_policy !== true
    || !Array.isArray(strict.bypass_actors) || strict.bypass_actors.length !== 0) {
    throw new Error('FCR_REQUIRED_RULESET_STRICT_MEMBRANE_INVALID');
  }
  const contexts = requiredContexts(strict);
  if (contexts.length !== FCR_CANONICAL_REQUIRED_CONTEXTS.length
    || !FCR_CANONICAL_REQUIRED_CONTEXTS.every((name) => contexts.some((row) => row.context === name))) {
    throw new Error('FCR_REQUIRED_RULESET_CANONICAL_CONTEXT_DRIFT');
  }
  return { id: strict.id, name: strict.name, topology: 'canonical_split',
    expectedCount: FCR_CANONICAL_REQUIRED_CONTEXTS.length, requiredChecks: contexts };
}

export function assessRequiredGate(requiredRule, checks, expectedSha) {
  const required = requiredRule?.requiredChecks;
  const unknown = {
    source: 'github-required-ruleset-and-exact-head-check-runs',
    authority: 'observational_only',
    rulesetId: FCR_REQUIRED_RULESET_ID,
    expectedCount: requiredRule?.expectedCount ?? FCR_EXPECTED_REQUIRED_CONTEXT_COUNT,
    topology: requiredRule?.topology ?? 'unknown',
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
    status: rows.length !== (requiredRule?.expectedCount ?? FCR_EXPECTED_REQUIRED_CONTEXT_COUNT) ? 'ruleset_drift'
      : counts.passed === rows.length && requiredRule?.topology === 'legacy_single'
        ? 'legacy_covered_not_canonical'
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
