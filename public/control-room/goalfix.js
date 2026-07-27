const STORAGE_KEY = 'fcr_session';
const form = document.getElementById('goalfix-form');
const result = document.getElementById('goalfix-result');
const message = document.getElementById('goalfix-message');
const submit = document.getElementById('goalfix-submit');

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function lines(value) {
  return String(value ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}

function list(items) {
  const ul = node('ul');
  for (const item of items ?? []) ul.appendChild(node('li', item));
  if (!ul.children.length) ul.appendChild(node('li', 'None recorded.'));
  return ul;
}

function section(title, items) {
  const wrap = node('section', undefined, 'goalfix-section');
  wrap.appendChild(node('h3', title));
  wrap.appendChild(list(items));
  return wrap;
}

function renderReport(report) {
  result.replaceChildren();

  const header = node('div');
  header.appendChild(node('div', 'Goalfix report', 'goalfix-kicker'));
  header.appendChild(node('h2', report.project?.name ?? report.project?.slug ?? 'Project'));
  const status = node('span', String(report.readiness ?? 'unknown').replaceAll('_', ' '), 'goalfix-status');
  status.dataset.state = report.readiness ?? 'unknown';
  header.appendChild(status);
  header.appendChild(node('p', `${report.target?.name ?? 'ref'} · ${report.target?.commitSha ?? 'unknown SHA'}`, 'goalfix-muted'));
  result.appendChild(header);

  const authority = node('div', undefined, 'goalfix-authority');
  const authorityLevel = node('div');
  authorityLevel.appendChild(node('strong', 'Authority'));
  authorityLevel.appendChild(node('div', `${report.authority?.level ?? 'unknown'} · ${report.authority?.mode ?? 'unknown'}`, 'goalfix-muted'));
  const routing = node('div');
  routing.appendChild(node('strong', 'Routing'));
  routing.appendChild(node('div', `${report.routing?.skill ?? 'unknown'} · ${report.routing?.connectorAction ?? 'unknown'}`, 'goalfix-muted'));
  authority.append(authorityLevel, routing);
  result.appendChild(authority);

  result.appendChild(section('REALITY', report.reality));
  result.appendChild(section('FIX', report.fix));
  result.appendChild(section('PROOF', report.proof));
  result.appendChild(section('RISK', report.risk));
  result.appendChild(section('ROLLBACK', report.rollback));

  const evidence = node('section', undefined, 'goalfix-section');
  evidence.appendChild(node('h3', 'Evidence classification'));
  for (const key of ['verified', 'inferred', 'unknown', 'blocked']) {
    evidence.appendChild(node('h4', key.toUpperCase()));
    evidence.appendChild(list(report.evidence?.[key]));
  }
  result.appendChild(evidence);

  const next = node('section', undefined, 'goalfix-section');
  next.appendChild(node('h3', 'NEXT GATE'));
  next.appendChild(node('p', report.nextGate ?? 'No next gate returned.'));
  result.appendChild(next);
}

function renderError(text) {
  message.replaceChildren(node('span', text, 'goalfix-error'));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.replaceChildren();

  const session = loadSession();
  if (!session?.access_token) {
    renderError('Founder session missing. Open the Control Room, sign in, then return to Goalfix.');
    return;
  }

  const values = Object.fromEntries(new FormData(form).entries());
  const payload = {
    projectSlug: String(values.projectSlug ?? '').trim(),
    targetRef: String(values.targetRef ?? '').trim(),
    desiredOutcome: String(values.desiredOutcome ?? '').trim(),
    reason: String(values.reason ?? '').trim() || undefined,
    suspectedFailureArea: String(values.suspectedFailureArea ?? '').trim() || undefined,
    constraints: lines(values.constraints),
    firstFilesOrLogs: lines(values.firstFilesOrLogs),
    stopCondition: String(values.stopCondition ?? '').trim() || undefined,
  };

  submit.disabled = true;
  submit.textContent = 'Inspecting…';
  try {
    const response = await fetch('/goalfix/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401) sessionStorage.removeItem(STORAGE_KEY);
    if (!response.ok) throw new Error(body?.error ?? `Inspection failed (${response.status})`);
    renderReport(body);
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  } finally {
    submit.disabled = false;
    submit.textContent = 'Inspect exact head';
  }
});
