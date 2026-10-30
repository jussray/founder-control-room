import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const INCIDENT_MARKER = '<!-- fcr-project-adapter-freshness-triage:v1 -->';
export const INCIDENT_TITLE = '[FCR] Project adapter source-contract drift requires review';
const VALID_SHA = /^[0-9a-f]{40}$/i;

function bounded(value) {
  if (typeof value !== 'string') return 'unknown';
  return value.replace(/[\r\n|]/g, ' ').slice(0, 250);
}

function head(value) {
  return typeof value === 'string' && VALID_SHA.test(value) ? value.toLowerCase() : 'unverified';
}

export function planFreshnessIncident(receipt) {
  if (!receipt || receipt.schemaVersion !== 1 || receipt.kind !== 'portfolio-project-adapter-freshness') {
    throw new Error('Unrecognized project-adapter freshness receipt');
  }
  if (typeof receipt.allFresh !== 'boolean') {
    throw new Error('Project-adapter freshness receipt lacks authoritative result');
  }

  const results = Array.isArray(receipt.results) ? receipt.results : [];
  if (receipt.allFresh && results.length === 0) {
    throw new Error('inconsistent allFresh receipt: no adapter results');
  }
  if (results.length > 0 && (
    !Number.isSafeInteger(receipt.adapterCount)
    || receipt.adapterCount !== results.length
    || receipt.adapterCount < 1
  )) {
    throw new Error('inconsistent adapter count in freshness receipt');
  }
  const identities = results.map((item) => item?.adapterId);
  if (new Set(identities).size !== identities.length) {
    throw new Error('duplicate adapter identity in freshness receipt');
  }

  const abnormal = results.filter((item) =>
    !item || !item.assessment
    || item.assessment.state !== 'verified'
    || item.assessment.freshness !== 'fresh'
    || (item.assessment.contractPathsMissing || []).length > 0
    || (item.assessment.contractPathsDrifted || []).length > 0
  );
  if (receipt.allFresh && abnormal.length > 0) {
    throw new Error('inconsistent allFresh receipt: non-fresh adapter found');
  }
  if (!receipt.allFresh && results.length > 0 && abnormal.length === 0) {
    throw new Error('inconsistent failed receipt: no failing adapter found');
  }
  if (receipt.allFresh) return { allFresh: true, body: null };

  const rows = abnormal.map((item) => {
    const assessment = item.assessment || {};
    const changed = Array.isArray(assessment.contractPathsDrifted) ? assessment.contractPathsDrifted : [];
    const missing = Array.isArray(assessment.contractPathsMissing) ? assessment.contractPathsMissing : [];
    return [
      '- **Adapter:** ' + bounded(item.adapterId),
      '  - Repository: ' + bounded(item.repository),
      '  - Audited head: ' + head(item.auditedHead),
      '  - Current head: ' + head(item.currentHead),
      '  - Assessment: ' + bounded(assessment.state) + ' / ' + bounded(assessment.freshness),
      '  - Changed contract files: ' + (changed.length ? changed.map(bounded).join(', ') : 'none'),
      '  - Missing contract files: ' + (missing.length ? missing.map(bounded).join(', ') : 'none'),
      '  - Next action: ' + bounded(assessment.nextAction || assessment.blocker || 'Inspect authoritative source evidence.'),
    ].join('\n');
  });
  if (rows.length === 0) {
    rows.push('- **Verifier receipt incomplete:** ' +
      bounded(receipt.assessment?.blocker || 'The scheduled verifier did not record adapter results.'));
  }

  const body = [
    INCIDENT_MARKER,
    '## Automated project-adapter contract review',
    '',
    'The hourly GitHub Actions freshness verification detected source contract drift or unavailable proof.',
    'This issue is a non-authorizing review record. It requires founder semantic review before any changed contract evidence is accepted.',
    '',
    ...rows,
    '',
    '### Required review',
    '1. Compare each exact audited source blob with the observed current-head blob.',
    '2. Verify authority restrictions, founder-final control, source identity, and runtime independence were not weakened.',
    '3. Restore unintended regressions in the source repository, or separately review any intentional change.',
    '4. Only then reconcile the checked-in adapter evidence and require a new exact-head verification receipt.',
    '',
    '**Safety:** No automatic merge, deployment, or authority promotion. No source-contract blob is silently trusted because its hash changed.',
    'The tracking issue can close automatically after a complete fresh verification; that does not approve an independent pending change.',
  ].join('\n');

  return { allFresh: false, body };
}

export function chooseIncidentAction(plan, previous) {
  if (plan.allFresh) {
    return previous?.state === 'open' ? { type: 'close' } : { type: 'none' };
  }
  if (!previous) return { type: 'create', body: plan.body };
  if (previous.state === 'closed') return { type: 'reopen', body: plan.body };
  return previous.body === plan.body
    ? { type: 'none' }
    : { type: 'update', body: plan.body };
}

async function reconcile() {
  const repo = process.env.GITHUB_REPOSITORY || '';
  const token = process.env.GITHUB_TOKEN || '';
  const [owner, name, extra] = repo.split('/');
  if (!owner || !name || extra || !token) {
    throw new Error('GitHub repository identity and an issues-write token are required');
  }
  const file = process.env.PROJECT_ADAPTER_FRESHNESS_RECEIPT || 'test-results/project-adapter-freshness.json';
  const plan = planFreshnessIncident(JSON.parse(await readFile(file, 'utf8')));
  const root = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const base = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name);

  async function request(method, path, payload) {
    const response = await fetch(root + path, {
      method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'fcr-project-adapter-drift-triage',
        'Authorization': 'Bearer ' + token,
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error('GitHub issue triage API failed: ' + method + ' ' + response.status);
    return response.json();
  }

  let prior = null;
  for (let page = 1; page <= 30; page += 1) {
    const issues = await request('GET', base + '/issues?state=all&sort=updated&direction=desc&per_page=100&page=' + page);
    if (!Array.isArray(issues)) throw new Error('Unexpected GitHub issue-list response');
    prior = issues.find((item) =>
      !item.pull_request
      && item.title === INCIDENT_TITLE
      && item.user?.login === 'github-actions[bot]'
      && typeof item.body === 'string'
      && item.body.includes(INCIDENT_MARKER)
    ) || null;
    if (prior || issues.length < 100) break;
    if (page === 30) throw new Error('Issue discovery exhausted: cannot safely deduplicate');
  }

  const action = chooseIncidentAction(plan, prior);
  if (action.type === 'create') {
    const created = await request('POST', base + '/issues', { title: INCIDENT_TITLE, body: action.body });
    console.log('Created review incident #' + created.number);
  } else if (action.type === 'update') {
    await request('PATCH', base + '/issues/' + prior.number, { body: action.body });
    console.log('Updated review incident #' + prior.number);
  } else if (action.type === 'reopen') {
    await request('PATCH', base + '/issues/' + prior.number, { state: 'open', body: action.body });
    console.log('Reopened review incident #' + prior.number);
  } else if (action.type === 'close') {
    await request('PATCH', base + '/issues/' + prior.number, { state: 'closed', state_reason: 'completed' });
    console.log('Closed review incident #' + prior.number + ' after fresh evidence');
  } else {
    console.log('No incident mutation required; freshness=' + plan.allFresh);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await reconcile();
}
