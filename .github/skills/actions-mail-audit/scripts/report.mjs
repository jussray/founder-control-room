import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';

const STATES = new Set([
  'CURRENT_RED', 'CURRENT_RUN_GREEN_ONLY', 'STALE_HEAD_NOT_PROVEN_FIXED',
  'SECURITY_TRIAGE_UNVERIFIED', 'PENDING', 'COVERAGE_BLOCKED', 'UNKNOWN'
]);

function safeUrl(url, repo) {
  if (typeof url !== 'string' || typeof repo !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.search || u.hash ||
        u.username || u.password || u.port) return null;
    const segments = u.pathname.split('/');
    if (segments.length !== 6 || segments[0] !== '' || segments[3] !== 'actions' ||
        segments[4] !== 'runs' || !/^[1-9]\d*$/.test(segments[5])) return null;
    if ((segments[1] + '/' + segments[2]).toLowerCase() !== repo.toLowerCase()) return null;
    return 'https://github.com/' + repo + '/actions/runs/' + segments[5];
  } catch { return null; }
}

export function renderSafeSummary(data) {
  if (!data || data.schema !== 'juss.actions-mail-result@v1' ||
      !/^jussray\/[a-z0-9_.-]+$/i.test(data.repo || '') || !Array.isArray(data.results)) {
    throw new Error('AUDIT_RECEIPT_INVALID');
  }
  const counts = Object.fromEntries([...STATES].map(s => [s, 0]));
  const attention = [];
  for (const x of data.results) {
    if (!x || !STATES.has(x.status) || x.repo !== data.repo) throw new Error('AUDIT_STATE_INVALID');
    counts[x.status]++;
    if (['CURRENT_RED', 'SECURITY_TRIAGE_UNVERIFIED', 'COVERAGE_BLOCKED'].includes(x.status)) {
      const url = safeUrl(x.source_url, data.repo);
      attention.push({ status: x.status, url, sha: /^[0-9a-f]{40}$/.test(x.head || '') ? x.head.slice(0, 12) : null });
    }
  }
  const lines = [
    '## Read-only Actions mail audit',
    '',
    'Source: authorized Gmail notification metadata; GitHub run/branch readback is required for current-head classification.',
    'Scope: repository only. This is not a production, security, mailbox-completeness, or all-required-checks certificate.',
    '',
    ...[...STATES].map(s => '- ' + s + ': ' + counts[s]),
    '',
  ];
  if (attention.length) {
    lines.push('### Triage signals (not repair authority)', '');
    for (const x of attention.slice(0, 20)) {
      const link = x.url ? '[GitHub run](' + x.url + ')' : 'No verified run URL';
      lines.push('- ' + x.status + ' | ' + link + (x.sha ? ' | run head ' + x.sha : ''));
    }
    if (attention.length > 20) lines.push('- More signals omitted: inspect authorized private evidence');
  } else {
    lines.push('No matching new/current failing run identified in this bounded sample. This is not proof that no failures exist.');
  }
  lines.push('', 'No emails, repositories, permissions, or production resources were modified.', '');
  return lines.join('\n');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 2000000) throw new Error('AUDIT_INPUT_TOO_LARGE');
  }
  const summary = renderSafeSummary(JSON.parse(input));
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    process.stderr.write('BLOCKED: sanitized audit result is unavailable or invalid\n');
    process.exitCode = 2;
  });
}
