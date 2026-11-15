const byId = (id) => document.getElementById(id);
const status = (id, message) => { byId(id).textContent = message; };
async function call(path, options = {}) {
  const response = await fetch(`/owner-insights/${path}`, {
    cache: 'no-store', credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Founder authorization required. Sign in to the Control Room.');
    if (body.error === 'search_console_not_configured') throw new Error('Google Search Console is not configured. Add the service account as a read-only property user and configure its Worker secret.');
    if (body.error === 'ai_gateway_not_configured') throw new Error('AI Gateway binding not configured on this Worker.');
    throw new Error(typeof body.error === 'string' ? body.error : `Provider returned HTTP ${response.status}`);
  }
  return body;
}
function cells(tbody, rows, pick) {
  tbody.replaceChildren();
  if (!Array.isArray(rows) || rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'No results returned by provider — not proof of zero indexed pages.';
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const value of pick(row)) {
      const td = document.createElement('td');
      td.textContent = value === null || value === undefined ? 'Unknown' : String(value);
      tr.append(td);
    }
    tbody.append(tr);
  }
}
async function refresh() {
  const button = byId('gsc-refresh');
  button.disabled = true;
  status('gsc-status', 'Reading authorized provider data…');
  try {
    const data = await call('search-console');
    status('gsc-status', `Provider: ${data.source} · ${data.property} · observed ${data.observedAt} · ${data.coverage}. Property-wide indexed count: unavailable from this sample.`);
    cells(byId('sitemap-rows'), data.sitemaps, (row) => [row.path, row.status, row.lastDownloaded, row.errors]);
    cells(byId('index-rows'), data.inspected, (row) => [row.url, row.error || row.verdict, row.coverageState, row.lastCrawlTime]);
  } catch (error) {
    status('gsc-status', error.message || 'Provider read failed.');
    byId('sitemap-rows').replaceChildren();
    byId('index-rows').replaceChildren();
  } finally { button.disabled = false; }
}
function renderList(target, values) {
  target.replaceChildren();
  for (const value of values || []) {
    const li = document.createElement('li');
    li.textContent = String(value);
    target.append(li);
  }
  if (!target.childNodes.length) {
    const li = document.createElement('li');
    li.textContent = 'None identified by model; this does not establish completeness.';
    target.append(li);
  }
}
byId('gsc-refresh').addEventListener('click', refresh);
byId('challenge-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = byId('challenge-submit');
  const data = new FormData(form);
  const evidence = String(data.get('evidence') || '').split('\n').map((line) => line.trim()).filter(Boolean);
  byId('challenge-result').hidden = true;
  if (evidence.length < 1 || evidence.length > 8) {
    status('challenge-status', 'Provide between 1 and 8 evidence entries.');
    return;
  }
  const payload = {
    projectSlug: String(data.get('projectSlug') || '').trim(),
    claim: String(data.get('claim') || '').trim(),
    evidence: evidence.map((text, index) => ({ id: `e${index + 1}`, text })),
    consentToModel: data.get('consentToModel') === 'on',
  };
  button.disabled = true;
  status('challenge-status', 'Requesting proposal-only model review…');
  try {
    const result = await call('challenge', { method: 'POST', body: JSON.stringify(payload) });
    renderList(byId('challenge-gaps'), result.evidenceGaps);
    renderList(byId('challenge-questions'), result.attackQuestions);
    byId('challenge-gate').textContent = result.nextGate;
    byId('challenge-rationale').textContent = result.rationale;
    status('challenge-status', `Received ${result.reviewedAt}. Evidence fingerprint: ${result.inputFingerprintSha256}. Not independently verified.`);
    byId('challenge-result').hidden = false;
  } catch (error) {
    status('challenge-status', error.message || 'Model review failed.');
  } finally { button.disabled = false; }
});
void refresh();
