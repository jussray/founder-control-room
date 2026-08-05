import { pathToFileURL } from 'node:url';

const FIELD_ALIASES = new Map([
  ['resolution', 'resolution'],
  ['scope', 'scope'],
  ['exact head', 'exactHead'],
  ['proof', 'proof'],
  ['rollback', 'rollback'],
  ['next gate', 'nextGate'],
  ['unresolved risks', 'unresolvedRisks'],
  ['founder approval', 'founderApproval'],
]);

const ALLOWED_SCOPES = new Set(['code', 'docs', 'operations', 'non-code']);
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export function parseClosureEvidence(body) {
  if (typeof body !== 'string') return null;

  const heading = /^##\s+Closure Evidence\s*$/im;
  const match = heading.exec(body);
  if (!match) return null;

  const sectionStart = match.index + match[0].length;
  const remainder = body.slice(sectionStart);
  const nextHeading = remainder.search(/^##\s+/m);
  const section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  const fields = {};

  for (const line of section.split(/\r?\n/)) {
    const fieldMatch = line.match(/^\s*(?:[-*]\s*)?([^:]+):\s*(.+?)\s*$/);
    if (!fieldMatch) continue;

    const key = FIELD_ALIASES.get(fieldMatch[1].trim().toLowerCase());
    if (key) fields[key] = fieldMatch[2].trim();
  }

  return fields;
}

export function validateClosureEvidence({ body, authorLogin, authorAssociation, founderLogin }) {
  const evidence = parseClosureEvidence(body);
  const failures = [];
  const normalizedFounder = String(founderLogin || '').trim().toLowerCase();
  const normalizedAuthor = String(authorLogin || '').trim().toLowerCase();

  if (!evidence) {
    return ['No `## Closure Evidence` block was found in an issue comment.'];
  }

  if (normalizedAuthor !== normalizedFounder) {
    failures.push(`Closure evidence must be posted by @${founderLogin}.`);
  }

  if (!TRUSTED_ASSOCIATIONS.has(String(authorAssociation || '').toUpperCase())) {
    failures.push('Closure evidence author is not a trusted repository collaborator.');
  }

  if (!evidence.resolution) {
    failures.push('`Resolution:` is required.');
  }

  if (!ALLOWED_SCOPES.has(String(evidence.scope || '').toLowerCase())) {
    failures.push('`Scope:` must be one of: code, docs, operations, non-code.');
  }

  const exactHead = String(evidence.exactHead || '');
  const exactHeadIsSha = /^[0-9a-f]{40}$/i.test(exactHead);
  const exactHeadIsNotApplicable = /^not_applicable:\s+\S.+/i.test(exactHead);
  if (!exactHeadIsSha && !exactHeadIsNotApplicable) {
    failures.push('`Exact head:` must be a 40-character SHA or `not_applicable: <reason>`.');
  }

  if (!evidence.proof || /^none$/i.test(evidence.proof)) {
    failures.push('`Proof:` is required and may not be `none`.');
  }

  if (!evidence.rollback) {
    failures.push('`Rollback:` is required.');
  }

  if (!evidence.nextGate) {
    failures.push('`Next gate:` is required. Use `none` only when no follow-up remains.');
  }

  if (String(evidence.unresolvedRisks || '').toLowerCase() !== 'none') {
    failures.push('`Unresolved risks:` must be exactly `none` before closure.');
  }

  if (String(evidence.founderApproval || '').toLowerCase() !== `@${normalizedFounder}`) {
    failures.push(`\`Founder approval:\` must be exactly \`@${founderLogin}\`.`);
  }

  return failures;
}

async function githubRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API ${response.status}: ${detail.slice(0, 500)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function fetchAllComments({ apiUrl, repository, issueNumber, token }) {
  const comments = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest(
      `${apiUrl}/repos/${repository}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      token,
    );
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  return comments;
}

function closureFailureComment(failures) {
  return [
    '<!-- issue-close-gate -->',
    '## Issue closure gate blocked',
    '',
    'This issue was reopened because its closure evidence did not pass the founder gate.',
    '',
    '### Missing or invalid',
    ...failures.map((failure) => `- ${failure}`),
    '',
    'Post a new comment using `.github/ISSUE_CLOSE_EVIDENCE.md`, then close the issue again.',
    '',
    'Closing an issue is a separate authority gate. Merge, deployment, documentation, or verbal approval does not automatically authorize closure.',
  ].join('\n');
}

export async function enforceIssueCloseGate({
  apiUrl,
  repository,
  issueNumber,
  token,
  founderLogin,
}) {
  const comments = await fetchAllComments({ apiUrl, repository, issueNumber, token });
  const candidates = comments
    .filter((comment) => typeof comment.body === 'string' && /^##\s+Closure Evidence\s*$/im.test(comment.body))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latest = candidates[0];

  const failures = validateClosureEvidence({
    body: latest?.body,
    authorLogin: latest?.user?.login,
    authorAssociation: latest?.author_association,
    founderLogin,
  });

  if (failures.length === 0) {
    console.log(`Issue close gate passed for ${repository}#${issueNumber}.`);
    return { passed: true, failures: [] };
  }

  await githubRequest(`${apiUrl}/repos/${repository}/issues/${issueNumber}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'open' }),
  });

  await githubRequest(`${apiUrl}/repos/${repository}/issues/${issueNumber}/comments`, token, {
    method: 'POST',
    body: JSON.stringify({ body: closureFailureComment(failures) }),
  });

  return { passed: false, failures };
}

async function main() {
  const token = process.env.ISSUE_CLOSE_GATE_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const issueNumber = Number(process.env.ISSUE_CLOSE_GATE_NUMBER);
  const founderLogin = process.env.ISSUE_CLOSE_GATE_FOUNDER || 'jussray';
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

  if (!token) throw new Error('ISSUE_CLOSE_GATE_TOKEN is required.');
  if (!repository) throw new Error('GITHUB_REPOSITORY is required.');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('ISSUE_CLOSE_GATE_NUMBER must be a positive integer.');
  }

  const result = await enforceIssueCloseGate({
    apiUrl,
    repository,
    issueNumber,
    token,
    founderLogin,
  });

  if (!result.passed) {
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
