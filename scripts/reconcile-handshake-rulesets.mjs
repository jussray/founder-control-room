import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TARGETS = Object.freeze({
  'jussray/founder-control-room': Object.freeze({
    rulesetIds: [20819094, 28182360],
    requiredChecks: [
      'Required Gate', 'Verify test-ledger contract', 'CodeQL',
      'GitGuardian Security Checks', 'Analyze (actions)',
      'Analyze (javascript-typescript)', 'Analyze (python)',
      'Documentation truth gate', 'PR Continuity Exact-Head Gate',
    ],
    releaseEnvironments: ['founder-signal-engine-review', 'production', 'github-pages', 'copilot', 'expo-mobile'],
    releaseWorkflowPath: '.github/workflows/pages-production-release.yml',
  }),
  'jussray/Sekret-Bip': Object.freeze({
    rulesetIds: [27168673, 21250004],
    requiredChecks: [
      'deploy', 'Verify test-ledger contract', 'repository-truth',
      'merge-membrane', 'Bearer', 'CodeQL', 'GitGuardian Security Checks',
      'Analyze (actions)', 'Analyze (javascript-typescript)', 'Analyze (python)',
      'PR Continuity Exact-Head Gate',
    ],
    releaseEnvironments: ['cloudflare-production', 'github-pages', 'Preview', 'login', 'Production'],
    releaseWorkflowPath: '.github/workflows/deploy-cloudflare.yml',
  }),
});

const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const KEYED_SCANNERS = Object.freeze({ CodeQL: 'github-advanced-security', Bearer: 'github-advanced-security', 'GitGuardian Security Checks': 'gitguardian' });

function requireTrue(ok, message) {
  if (!ok) throw new Error('GOVERNANCE_BLOCKED: ' + message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
}

export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function normalizeRulesetPayload(value) {
  return {
    name: value.name,
    target: value.target,
    enforcement: value.enforcement,
    bypass_actors: structuredClone(value.bypass_actors),
    conditions: structuredClone(value.conditions),
    rules: structuredClone(value.rules),
  };
}

function checkReleaseEvidence(input, target) {
  const source = input.releaseWorkflow;
  requireTrue(typeof source === 'string' && source.length > 50, 'release workflow source not observed');
  const fcr = input.repository === 'jussray/founder-control-room';
  if (fcr) {
    requireTrue(source.includes('workflow_call') &&
      source.includes('environment: production') &&
      source.includes('current_main') && source.includes('EXPECTED_HEAD_SHA') &&
      source.includes('test "$current_main" = "$EXPECTED_HEAD_SHA"'),
    'release workflow must guard an exact current-main production deployment');
  } else {
    requireTrue(source.includes('\n  push:') &&
      source.includes('branches: [main]') &&
      source.includes('environment: Production') &&
      source.includes('current_main') && source.includes('TARGET_SHA') &&
      source.includes('test "$TARGET_SHA" = "$current_main"'),
    'release workflow must guard exact current-main production deployment');
  }
  requireTrue(Array.isArray(input.environments), 'release environments not observed');
  const byName = new Map(input.environments.map((entry) => [entry?.name, entry]));
  for (const name of target.releaseEnvironments) {
    requireTrue(byName.has(name), 'required release environment not verified: ' + name);
  }
  const production = byName.get(fcr ? 'production' : 'Production');
  const policy = production?.deployment_branch_policy;
  requireTrue(
    (Array.isArray(production?.protection_rules) && production.protection_rules.length > 0) ||
      policy?.protected_branches === true || policy?.custom_branch_policies === true,
    'release environment lacks provider-enforced protection');
  if (!fcr) {
    const p = input.founderOnlyPolicy;
    requireTrue(typeof p === 'string' &&
      p.includes('Current phase: founder-only') &&
      p.includes('require_code_owner_review: false') &&
      p.includes('require_last_push_approval: false'),
    'founder-only review phase lacks pinned source policy');
  }
}

function verifiedRequiredChecks(input, target) {
  requireTrue(Array.isArray(input.checkRuns), 'check-run list missing');
  // Do not reconcile a green predecessor and a red/re-running successor as green.
  requireTrue(input.checkRuns.every((run) => run?.status === 'completed' &&
    !['failure', 'cancelled', 'timed_out', 'action_required', 'stale'].includes(run.conclusion)),
  'failing or incomplete current-head check runs exist');
  return target.requiredChecks.map((context) => {
    const matching = input.checkRuns.filter((run) => run?.name === context &&
      run?.status === 'completed' && run?.conclusion === 'success');
    requireTrue(matching.length > 0, 'required check not successful on candidate head: ' + context);
    const appIds = [...new Set(matching.map((run) => run.app?.id))];
    const appSlugs = [...new Set(matching.map((run) => run.app?.slug))];
    requireTrue(appIds.length === 1 && Number.isInteger(appIds[0]) && appIds[0] > 0,
      'required check has ambiguous or missing application identity: ' + context);
    if (Object.hasOwn(KEYED_SCANNERS, context)) {
      requireTrue(appSlugs.length === 1 && appSlugs[0] === KEYED_SCANNERS[context],
        'required scanner check issued by wrong application: ' + context);
    }
    return { context, integration_id: appIds[0] };
  });
}

function mainBranchTargeted(ruleset) {
  const include = ruleset?.conditions?.ref_name?.include;
  return Array.isArray(include) &&
    (include.includes('~DEFAULT_BRANCH') || include.includes('refs/heads/main'));
}

function reconcileOneRuleset(existing, target, input, entries) {
  requireTrue(existing && target.rulesetIds.includes(existing.id),
    'unrecognized ruleset');
  requireTrue(existing.enforcement === 'active' && existing.target === 'branch' &&
    mainBranchTargeted(existing), 'ruleset not active on main');
  requireTrue(Array.isArray(existing.bypass_actors) && Array.isArray(existing.rules),
    'provider ruleset security snapshot incomplete');
  const status = existing.rules.find((rule) => rule.type === 'required_status_checks');
  const deploy = existing.rules.find((rule) => rule.type === 'required_deployments');
  const pull = existing.rules.find((rule) => rule.type === 'pull_request');
  const scan = existing.rules.find((rule) => rule.type === 'code_scanning');
  requireTrue(status && deploy && pull && scan,
    'missing existing status, deployment, pull-request or code-scanning protections');
  // Rulesets are layered: each must preserve its own security rules unchanged.
  // Aggregate deletion/force-push protections are checked before any plan is built.
  const selected = entries.map((entry) => {
    const old = status.parameters?.required_status_checks?.find((c) => c.context === entry.context);
    requireTrue(!old?.integration_id || old.integration_id === entry.integration_id,
      'check identity changed: ' + entry.context);
    return { context: entry.context, integration_id: entry.integration_id };
  });
  const after = structuredClone(existing);
  after.rules = after.rules.filter((rule) => rule.type !== 'required_deployments')
    .map((rule) => {
      if (rule.type === 'required_status_checks') {
        rule.parameters = { ...rule.parameters,
          required_status_checks: structuredClone(selected) };
      }
      if (rule.type === 'pull_request' && input.repository === 'jussray/Sekret-Bip') {
        rule.parameters = { ...rule.parameters,
          required_approving_review_count: 0,
          require_code_owner_review: false,
          require_last_push_approval: false };
      }
      return rule;
    });
  return { id: existing.id, before: structuredClone(existing), after };
}

export function buildRulesetPlan(input) {
  requireTrue(input && typeof input === 'object', 'missing reconciliation request');
  const target = TARGETS[input.repository];
  requireTrue(target, 'repository not allowlisted');
  requireTrue(SHA.test(input.expectedMainSha || '') && SHA.test(input.expectedHeadSha || ''),
    'expected main/head SHA invalid');
  requireTrue(input.observedMainSha === input.expectedMainSha,
    'current main changed');
  const pr = input.pullRequest;
  requireTrue(pr?.state === 'open' && pr?.draft === false &&
    pr?.head?.sha === input.expectedHeadSha && pr?.base?.sha === input.expectedMainSha,
    'PR exact head mismatch, moved base, or ineligible state');
  checkReleaseEvidence(input, target);
  const entries = verifiedRequiredChecks(input, target);
  requireTrue(Array.isArray(input.rulesets) && input.rulesets.length === target.rulesetIds.length &&
    target.rulesetIds.every((id) => input.rulesets.filter((r) => r?.id === id).length === 1),
  'expected exact active ruleset IDs only');
  const hasAggregate = (type) => input.rulesets.some((ruleset) =>
    Array.isArray(ruleset.rules) && ruleset.rules.some((r) => r.type === type));
  requireTrue(hasAggregate('deletion') && hasAggregate('non_fast_forward'),
    'aggregate deletion and force-push protection missing');
  const updates = target.rulesetIds.map((id) =>
    reconcileOneRuleset(input.rulesets.find((rule) => rule.id === id), target, input, entries));
  const planSubject = {
    repository: input.repository,
    expectedMainSha: input.expectedMainSha,
    expectedHeadSha: input.expectedHeadSha,
    updates: updates.map((u) => ({
      id: u.id,
      beforeFingerprint: fingerprint(normalizeRulesetPayload(u.before)),
      afterPayload: normalizeRulesetPayload(u.after),
    })),
  };
  return { ...planSubject, updates, digest: fingerprint(planSubject), applied: false };
}

export function verifyApproval(plan, { planDigest, headSha }) {
  requireTrue(SHA256.test(planDigest || '') && planDigest === plan.digest &&
    headSha === plan.expectedHeadSha,
  'founder approval digest or exact head mismatch');
  return true;
}

async function requestGitHub(path, token, method = 'GET', body) {
  requireTrue(typeof token === 'string' && token.length > 0, 'GitHub scoped token missing');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('https://api.github.com' + path, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'jussco-founder-governance-reconciler',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const parsed = await response.json().catch(() => null);
    requireTrue(response.ok && parsed !== null,
      'GitHub provider request rejected (' + method + ', HTTP ' + response.status + ')');
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function collectProviderInput({ repository, prNumber, expectedMainSha,
  expectedHeadSha, token, transport = requestGitHub }) {
  const parts = repository.split('/');
  requireTrue(parts.length === 2 && TARGETS[repository], 'invalid allowlisted repository');
  const root = '/repos/' + parts.map(encodeURIComponent).join('/');
  const target = TARGETS[repository];
  requireTrue(SHA.test(expectedMainSha || '') && SHA.test(expectedHeadSha || '') &&
    Number.isSafeInteger(prNumber) && prNumber > 0,
  'invalid input identity before provider read');
  const [main, pr, checks, envs, workflow, ...rulesets] = await Promise.all([
    transport(root + '/branches/main', token),
    transport(root + '/pulls/' + prNumber, token),
    transport(root + '/commits/' + expectedHeadSha + '/check-runs?per_page=100', token),
    transport(root + '/environments?per_page=100', token),
    transport(root + '/contents/' + target.releaseWorkflowPath + '?ref=' +
      expectedMainSha, token),
    ...target.rulesetIds.map((id) => transport(root + '/rulesets/' + id, token)),
  ]);
  requireTrue(checks.total_count <= 100 && Array.isArray(checks.check_runs),
    'check-run result paginated or incomplete');
  requireTrue(envs.total_count <= 100 && Array.isArray(envs.environments),
    'environment result paginated or incomplete');
  requireTrue(workflow.encoding === 'base64' && typeof workflow.content === 'string',
    'release workflow response unusable');
  let founderOnlyPolicy = '';
  if (repository === 'jussray/Sekret-Bip') {
    const policy = await transport(root +
      '/contents/docs/governance/main-governance-acceptance-probe.md?ref=' +
      expectedMainSha, token);
    requireTrue(policy.encoding === 'base64', 'founder-only policy unavailable');
    founderOnlyPolicy = Buffer.from(policy.content, 'base64').toString('utf8');
  }
  return {
    repository, expectedMainSha, expectedHeadSha,
    observedMainSha: main.commit?.sha,
    pullRequest: pr, checkRuns: checks.check_runs,
    rulesets, environments: envs.environments,
    releaseWorkflow: Buffer.from(workflow.content, 'base64').toString('utf8'),
    founderOnlyPolicy,
  };
}

function rootFor(repository) {
  return '/repos/' + repository.split('/').map(encodeURIComponent).join('/');
}

function storePrewriteBackup(receipt) {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/handshake-ruleset-prewrite.json',
    JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}

export async function reconcileProvider({
  repository, prNumber, expectedMainSha, expectedHeadSha, token, apply = false,
  approvedPlanDigest = '', approvedHeadSha = '', transport = requestGitHub,
  backupWriter = storePrewriteBackup,
}) {
  const source = { repository, prNumber, expectedMainSha, expectedHeadSha, token };
  const initial = buildRulesetPlan(await collectProviderInput({ ...source, transport }));
  if (!apply) return initial;
  verifyApproval(initial, { planDigest: approvedPlanDigest, headSha: approvedHeadSha });
  const fresh = buildRulesetPlan(await collectProviderInput({ ...source, transport }));
  requireTrue(initial.digest === fresh.digest, 'provider state changed before write');
  // Durable intent-before-effect: preserve exact provider payloads for inspected
  // recovery before any privileged mutation. Never include bearer credentials.
  backupWriter({
    contract: 'jussco/handshake-ruleset-prewrite@v1',
    repository, prNumber, expectedMainSha, expectedHeadSha,
    approvedPlanDigest: fresh.digest, applied: false,
    beforePayloads: fresh.updates.map((u) => ({ id: u.id,
      payload: normalizeRulesetPayload(u.before),
      digest: fingerprint(normalizeRulesetPayload(u.before)) })),
    approvedAfterDigests: fresh.updates.map((u) => ({ id: u.id,
      digest: fingerprint(normalizeRulesetPayload(u.after)) })),
  });
  const base = rootFor(repository);
  const written = [];
  try {
    for (const update of fresh.updates) {
      const [currentMain, currentPR] = await Promise.all([
        transport(base + '/branches/main', token),
        transport(base + '/pulls/' + prNumber, token),
      ]);
      requireTrue(currentMain.commit?.sha === expectedMainSha &&
        currentPR.state === 'open' && currentPR.head?.sha === expectedHeadSha &&
        currentPR.base?.sha === expectedMainSha, 'PR head/main moved during provider update');
      const path = base + '/rulesets/' + update.id;
      const before = await transport(path, token);
      requireTrue(fingerprint(normalizeRulesetPayload(before)) ===
        fingerprint(normalizeRulesetPayload(update.before)),
      'ruleset changed during reconciliation: ' + update.id);
      // Track the intent before the external effect: a network failure after PUT
      // must never be mistaken for proof that no provider mutation occurred.
      written.push(update);
      await transport(path, token, 'PUT', normalizeRulesetPayload(update.after));
      const observed = await transport(path, token);
      requireTrue(fingerprint(normalizeRulesetPayload(observed)) ===
        fingerprint(normalizeRulesetPayload(update.after)),
      'provider readback differs from approved ruleset: ' + update.id);
    }
    return { repository, digest: fresh.digest, applied: true,
      updatedRulesetIds: written.map((w) => w.id),
      providerReadback: 'EXACT_MATCH', requiresNegativeAndPositiveProbe: true };
  } catch (error) {
    const rollbackErrors = [];
    for (const update of [...written].reverse()) {
      try {
        const path = base + '/rulesets/' + update.id;
        const now = await transport(path, token);
        const current = fingerprint(normalizeRulesetPayload(now));
        const beforeHash = fingerprint(normalizeRulesetPayload(update.before));
        const afterHash = fingerprint(normalizeRulesetPayload(update.after));
        // A failed PUT may have had no effect, or succeeded before timeout.
        if (current === beforeHash) continue;
        if (current !== afterHash) {
          rollbackErrors.push('concurrent change on ruleset ' + update.id);
          continue;
        }
        await transport(path, token, 'PUT', normalizeRulesetPayload(update.before));
        const restored = await transport(path, token);
        if (fingerprint(normalizeRulesetPayload(restored)) !==
            fingerprint(normalizeRulesetPayload(update.before))) {
          rollbackErrors.push('rollback readback mismatch on ruleset ' + update.id);
        }
      } catch {
        rollbackErrors.push('rollback provider failure on ruleset ' + update.id);
      }
    }
    throw new Error('GOVERNANCE_BLOCKED: provider reconciliation failed; rollback=' +
      (rollbackErrors.length ? rollbackErrors.join(',') : 'verified for completed writes') +
      '; cause=' + (error instanceof Error ? error.message : String(error)));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? '' : args[i + 1] || '';
  };
  const apply = args.includes('--apply');
  const repository = arg('--repo');
  const result = await reconcileProvider({
    repository, prNumber: Number(arg('--pr')),
    expectedMainSha: arg('--main'),
    expectedHeadSha: arg('--head'),
    token: process.env.GITHUB_RULESET_ADMIN_TOKEN || (!apply ? process.env.GITHUB_TOKEN : ''),
    apply,
    approvedPlanDigest: process.env.FOUNDER_APPROVED_PLAN_SHA256 || '',
    approvedHeadSha: process.env.FOUNDER_APPROVED_HEAD_SHA || '',
  });
  // Deliberately emits no token, environment variables or other credentials.
  const safe = apply ? result : {
    repository: result.repository, expectedMainSha: result.expectedMainSha,
    expectedHeadSha: result.expectedHeadSha, digest: result.digest,
    candidatePayloads: result.updates.map((update) => ({
      id: update.id,
      beforeDigest: fingerprint(normalizeRulesetPayload(update.before)),
      afterDigest: fingerprint(normalizeRulesetPayload(update.after)),
      afterPayload: normalizeRulesetPayload(update.after),
    })),
    applied: false,
  };
  process.stdout.write(JSON.stringify(safe, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
