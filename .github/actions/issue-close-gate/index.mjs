import { createHash } from 'node:crypto';
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
const REPOSITORY_SCOPES = new Set(['code', 'docs']);
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const INTEGRATED_COMPARE_STATUSES = new Set(['identical']);

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

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

  const scope = String(evidence.scope || '').toLowerCase();
  if (!ALLOWED_SCOPES.has(scope)) {
    failures.push('`Scope:` must be one of: code, docs, operations, non-code.');
  }

  const exactHead = String(evidence.exactHead || '');
  const exactHeadIsSha = /^[0-9a-f]{40}$/i.test(exactHead);
  const exactHeadIsNotApplicable = /^not_applicable:\s+\S.+/i.test(exactHead);
  if (REPOSITORY_SCOPES.has(scope) && !exactHeadIsSha) {
    failures.push('`Exact head:` must be a 40-character SHA for code or documentation scope.');
  } else if (!exactHeadIsSha && !exactHeadIsNotApplicable) {
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

export function latestReopenedAt(events, closedAt) {
  const closedAtMs = timestamp(closedAt);
  if (closedAtMs === null) return null;

  const candidates = events
    .filter((event) => event?.event === 'reopened')
    .map((event) => ({ value: event.created_at, time: timestamp(event.created_at) }))
    .filter((event) => event.time !== null && event.time < closedAtMs)
    .sort((a, b) => b.time - a.time);

  return candidates[0]?.value ?? null;
}

export function selectFreshClosureEvidence({ comments, closedAt, reopenedAt, founderLogin }) {
  const closedAtMs = timestamp(closedAt);
  const reopenedAtMs = reopenedAt ? timestamp(reopenedAt) : null;
  const normalizedFounder = String(founderLogin || '').trim().toLowerCase();
  if (closedAtMs === null || (reopenedAt && reopenedAtMs === null)) return null;

  return comments
    .filter((comment) => typeof comment.body === 'string' && /^##\s+Closure Evidence\s*$/im.test(comment.body))
    .filter((comment) => !normalizedFounder
      || String(comment.user?.login || '').trim().toLowerCase() === normalizedFounder)
    .map((comment) => ({
      comment,
      createdAt: timestamp(comment.created_at),
      updatedAt: timestamp(comment.updated_at),
    }))
    .filter(({ createdAt, updatedAt }) => createdAt !== null && updatedAt !== null)
    .filter(({ createdAt, updatedAt }) => createdAt <= closedAtMs && updatedAt <= closedAtMs)
    .filter(({ createdAt }) => reopenedAtMs === null || createdAt > reopenedAtMs)
    .sort((a, b) => b.createdAt - a.createdAt)[0]?.comment ?? null;
}

export function isCurrentCloseEvent(issue, closedAt) {
  const eventClosedAt = timestamp(closedAt);
  const issueClosedAt = timestamp(issue?.closed_at);
  return issue?.state === 'closed'
    && eventClosedAt !== null
    && issueClosedAt !== null
    && issueClosedAt === eventClosedAt;
}

export function isIntegratedCompareStatus(status) {
  return INTEGRATED_COMPARE_STATUSES.has(String(status || '').toLowerCase());
}

export function closureReceiptComment({ repository, issueNumber, closedAt, evidenceComment }) {
  const evidenceHash = createHash('sha256')
    .update(String(evidenceComment.body || ''), 'utf8')
    .digest('hex');
  const marker = `<!-- issue-close-gate:passed:${evidenceComment.id}:${closedAt} -->`;

  return {
    marker,
    body: [
      marker,
      '## Issue closure gate passed',
      '',
      `- Issue: \`${repository}#${issueNumber}\``,
      `- Closed at: \`${closedAt}\``,
      `- Evidence comment: \`${evidenceComment.id}\``,
      `- Evidence author: \`@${evidenceComment.user?.login || 'unknown'}\``,
      `- Evidence created: \`${evidenceComment.created_at || 'unknown'}\``,
      `- Evidence last edited: \`${evidenceComment.updated_at || 'unknown'}\``,
      `- Evidence SHA-256: \`${evidenceHash}\``,
      '',
      'The issue remained closed because fresh founder-approved evidence passed the close-issue gate with zero unresolved risks.',
      '',
      'This receipt proves the gate decision for this close event. It does not silently prove deployment, production, provider, database, browser, device, payment, publication, or other separately gated state.',
    ].join('\n'),
  };
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

async function fetchAllPages({ apiUrl, repository, issueNumber, token, resource }) {
  const values = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest(
      `${apiUrl}/repos/${repository}/issues/${issueNumber}/${resource}?per_page=100&page=${page}`,
      token,
    );
    values.push(...batch);
    if (batch.length < 100) break;
  }
  return values;
}

async function validateIntegratedRepositoryHead({ apiUrl, repository, token, evidence }) {
  const exactHead = String(evidence?.exactHead || '');
  if (!/^[0-9a-f]{40}$/i.test(exactHead)) return [];

  try {
    const repositoryRecord = await githubRequest(`${apiUrl}/repos/${repository}`, token);
    const defaultBranch = repositoryRecord?.default_branch;
    if (!defaultBranch) {
      return ['The repository default branch could not be determined for exact-head verification.'];
    }

    const compareRef = encodeURIComponent(`${exactHead}...${defaultBranch}`);
    const comparison = await githubRequest(
      `${apiUrl}/repos/${repository}/compare/${compareRef}`,
      token,
    );

    if (!isIntegratedCompareStatus(comparison?.status)) {
      return [
        `\`Exact head:\` ${exactHead} does not match the current repository default-branch head \`${defaultBranch}\`.`,
      ];
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`Exact-head repository verification failed: ${message}`];
  }

  return [];
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
    'Post a fresh comment using `.github/ISSUE_CLOSE_EVIDENCE.md`, then close the issue again.',
    '',
    'Closing an issue is a separate authority gate. Merge, deployment, documentation, or verbal approval does not automatically authorize closure.',
  ].join('\n');
}

export async function enforceIssueCloseGate({
  apiUrl,
  repository,
  issueNumber,
  closedAt,
  token,
  founderLogin,
}) {
  const issueUrl = `${apiUrl}/repos/${repository}/issues/${issueNumber}`;
  const [issue, comments, events] = await Promise.all([
    githubRequest(issueUrl, token),
    fetchAllPages({ apiUrl, repository, issueNumber, token, resource: 'comments' }),
    fetchAllPages({ apiUrl, repository, issueNumber, token, resource: 'events' }),
  ]);

  if (!isCurrentCloseEvent(issue, closedAt)) {
    console.log(`Skipped stale issue close event for ${repository}#${issueNumber} at ${closedAt}.`);
    return { passed: true, failures: [], skipped: true };
  }

  const reopenedAt = latestReopenedAt(events, closedAt);
  const latest = selectFreshClosureEvidence({ comments, closedAt, reopenedAt, founderLogin });
  const structuralFailures = latest
    ? validateClosureEvidence({
        body: latest.body,
        authorLogin: latest.user?.login,
        authorAssociation: latest.author_association,
        founderLogin,
      })
    : [
        reopenedAt
          ? 'No fresh founder-authored `## Closure Evidence` comment was created after the latest reopen and before this close event.'
          : 'No fresh founder-authored `## Closure Evidence` comment was created before this close event.',
      ];

  const repositoryFailures = structuralFailures.length === 0
    ? await validateIntegratedRepositoryHead({
        apiUrl,
        repository,
        token,
        evidence: parseClosureEvidence(latest.body),
      })
    : [];
  const failures = [...structuralFailures, ...repositoryFailures];

  const currentIssue = await githubRequest(issueUrl, token);
  if (!isCurrentCloseEvent(currentIssue, closedAt)) {
    console.log(`Skipped stale issue close mutation for ${repository}#${issueNumber} at ${closedAt}.`);
    return { passed: true, failures: [], skipped: true };
  }

  if (failures.length === 0) {
    const receipt = closureReceiptComment({
      repository,
      issueNumber,
      closedAt,
      evidenceComment: latest,
    });
    const receiptExists = comments.some(
      (comment) => typeof comment.body === 'string' && comment.body.includes(receipt.marker),
    );

    if (!receiptExists) {
      await githubRequest(`${issueUrl}/comments`, token, {
        method: 'POST',
        body: JSON.stringify({ body: receipt.body }),
      });
    }

    console.log(`Issue close gate passed for ${repository}#${issueNumber}.`);
    return { passed: true, failures: [], skipped: false };
  }

  await githubRequest(issueUrl, token, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'open' }),
  });

  await githubRequest(`${issueUrl}/comments`, token, {
    method: 'POST',
    body: JSON.stringify({ body: closureFailureComment(failures) }),
  });

  return { passed: false, failures, skipped: false };
}

async function main() {
  const token = process.env.ISSUE_CLOSE_GATE_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const issueNumber = Number(process.env.ISSUE_CLOSE_GATE_NUMBER);
  const closedAt = process.env.ISSUE_CLOSE_GATE_CLOSED_AT;
  const founderLogin = process.env.ISSUE_CLOSE_GATE_FOUNDER || 'jussray';
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

  if (!token) throw new Error('ISSUE_CLOSE_GATE_TOKEN is required.');
  if (!repository) throw new Error('GITHUB_REPOSITORY is required.');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('ISSUE_CLOSE_GATE_NUMBER must be a positive integer.');
  }
  if (timestamp(closedAt) === null) {
    throw new Error('ISSUE_CLOSE_GATE_CLOSED_AT must be a valid ISO timestamp.');
  }

  const result = await enforceIssueCloseGate({
    apiUrl,
    repository,
    issueNumber,
    closedAt,
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
