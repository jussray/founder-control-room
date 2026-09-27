#!/usr/bin/env node

const repository = process.env.GITHUB_REPOSITORY || 'jussray/founder-control-room';
const token = process.env.GITHUB_TOKEN || '';

if (!token) throw new Error('GITHUB_TOKEN_REQUIRED');

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fcr-pr-continuity-ruleset-audit-v1',
    },
  });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}: ${await response.text()}`);
  return response.json();
}

const [owner, repo] = repository.split('/');
if (!owner || !repo) throw new Error(`INVALID_GITHUB_REPOSITORY: ${repository}`);

const summaries = await api(`/repos/${owner}/${repo}/rulesets`);
const active = summaries.filter((row) => row.enforcement === 'active');
const receipts = [];

for (const summary of active) {
  const ruleset = await api(`/repos/${owner}/${repo}/rulesets/${summary.id}`);
  if (ruleset.target !== 'branch') continue;

  const includes = ruleset.conditions?.ref_name?.include || [];
  const ruleTypes = new Set((ruleset.rules || []).map((rule) => rule.type));
  const productionGrade = [
    'required_status_checks',
    'code_scanning',
    'required_linear_history',
    'required_deployments',
  ].some((type) => ruleTypes.has(type));

  if (productionGrade && includes.includes('~ALL')) {
    receipts.push({
      rulesetId: ruleset.id,
      name: ruleset.name,
      code: 'ALL_BRANCH_RELEASE_RULES_BLOCK_ROLLOVER',
      includes,
      ruleTypes: [...ruleTypes],
      evidence:
        'Active production-grade branch rules include ~ALL. GitHub update-branch on active PR heads can therefore be rejected for missing release checks/deployments or for creating a merge commit under linear-history rules.',
      requiredFix:
        'Remove ~ALL from this release ruleset. Scope it to ~DEFAULT_BRANCH and any explicit release refs. Keep active-work branch proof in PR workflows rather than production deployment rules.',
    });
  }
}

const receipt = {
  schema: 'juss/pr-continuity-ruleset-audit@v1',
  repository,
  activeRulesetsChecked: active.length,
  blockerCount: receipts.length,
  blockers: receipts,
};

console.log(JSON.stringify(receipt, null, 2));

if (receipts.length) {
  throw new Error(
    `PR_CONTINUITY_RULESET_BLOCKED: ${receipts.map((r) => `${r.rulesetId}:${r.code}`).join(',')}`,
  );
}
