const ATTEMPTS_KEY_PREFIX = 'fcr_goalfix_attempts_v1';
const MAX_ATTEMPTS_PER_SIGNATURE = 3;
const MAX_ATTEMPTS = 60;
const ATTEMPT_PRIORITY = Object.freeze({ passed: 1, incomplete: 2, blocked: 3, failed: 3 });
const form = document.getElementById('goalfix-form');
const result = document.getElementById('goalfix-result');
const message = document.getElementById('goalfix-message');
const submit = document.getElementById('goalfix-submit');

function lines(value) {
  return String(value ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSignalName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function fingerprint(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizedVerificationNames(values) {
  return [...new Set(
    (values ?? [])
      .map(normalizeSignalName)
      .filter(Boolean),
  )].sort();
}

function attemptScopeId({ desiredOutcome, suspectedFailureArea, firstFilesOrLogs, expectedVerificationNames }) {
  return fingerprint([
    String(desiredOutcome ?? '').trim(),
    String(suspectedFailureArea ?? '').trim(),
    ...(firstFilesOrLogs ?? []),
    ...normalizedVerificationNames(expectedVerificationNames),
  ].join('\u241f'));
}

function attemptStorageKey(projectSlug, targetRef, scopeId) {
  const project = String(projectSlug ?? '').trim().toLowerCase();
  const target = String(targetRef ?? '').trim() || 'main';
  return `${ATTEMPTS_KEY_PREFIX}:${project}:${target}:${scopeId}`;
}

function sanitizeAttempt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const approach = typeof value.approach === 'string' ? value.approach.trim().slice(0, 500) : '';
  const failureSignature = typeof value.failureSignature === 'string'
    ? value.failureSignature.trim().slice(0, 500)
    : undefined;
  const verificationName = typeof value.verificationName === 'string'
    ? value.verificationName.trim().slice(0, 200)
    : undefined;
  const commitSha = typeof value.commitSha === 'string' && /^[a-f0-9]{40}$/i.test(value.commitSha.trim())
    ? value.commitSha.trim().toLowerCase()
    : undefined;
  const resultValue = value.result;
  const result = (
    resultValue === 'passed'
    || resultValue === 'failed'
    || resultValue === 'blocked'
    || resultValue === 'incomplete'
  ) ? resultValue : null;
  const filesTouched = Array.isArray(value.filesTouched)
    ? value.filesTouched
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 20)
    : [];

  if (!approach || !result) return null;
  return {
    approach,
    failureSignature,
    filesTouched,
    verificationName,
    commitSha,
    result,
  };
}

function attemptSignature(attempt) {
  return attempt.failureSignature
    || `verification:${normalizeSignalName(attempt.verificationName)}`
    || attempt.approach;
}

function boundAttempts(attempts) {
  const sanitized = attempts.map(sanitizeAttempt).filter(Boolean);
  const signatureCounts = new Map();
  const reversed = [];

  for (let index = sanitized.length - 1; index >= 0; index -= 1) {
    const attempt = sanitized[index];
    const signature = attemptSignature(attempt);
    const count = signatureCounts.get(signature) ?? 0;
    if (count >= MAX_ATTEMPTS_PER_SIGNATURE) continue;
    signatureCounts.set(signature, count + 1);
    reversed.push(attempt);
  }

  return reversed.reverse().slice(-MAX_ATTEMPTS);
}

function loadAttempts(projectSlug, targetRef, scopeId) {
  try {
    const raw = sessionStorage.getItem(attemptStorageKey(projectSlug, targetRef, scopeId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return boundAttempts(parsed);
  } catch {
    return [];
  }
}

function saveAttempts(projectSlug, targetRef, scopeId, attempts) {
  sessionStorage.setItem(
    attemptStorageKey(projectSlug, targetRef, scopeId),
    JSON.stringify(boundAttempts(attempts)),
  );
}

function attemptFromProofLine(value) {
  const line = String(value ?? '').trim();
  const match = line.match(/^(.+): (passed|failed|cancelled|queued|running|skipped|unknown) at ([a-f0-9]{40})$/i);
  if (!match) return null;

  const verificationName = match[1].trim().slice(0, 200);
  const status = match[2].toLowerCase();
  const commitSha = match[3].toLowerCase();
  const normalizedName = normalizeSignalName(verificationName);

  return sanitizeAttempt({
    approach: `Inspect ${verificationName} at ${commitSha}`,
    failureSignature: `verification:${normalizedName}`,
    filesTouched: [],
    verificationName,
    commitSha,
    result: status === 'passed'
      ? 'passed'
      : status === 'failed' || status === 'cancelled'
        ? 'failed'
        : 'incomplete',
  });
}

function collapseInspectionAttempts(attempts) {
  const byCheckAndCommit = new Map();

  for (const attempt of attempts) {
    const key = `${normalizeSignalName(attempt.verificationName)}:${attempt.commitSha ?? ''}`;
    const current = byCheckAndCommit.get(key);
    if (!current || ATTEMPT_PRIORITY[attempt.result] > ATTEMPT_PRIORITY[current.result]) {
      byCheckAndCommit.set(key, attempt);
    }
  }

  return [...byCheckAndCommit.values()];
}

function recordVerificationAttempts(
  report,
  projectSlug,
  targetRef,
  scopeId,
  expectedVerificationNames,
) {
  const requiredNames = new Set(expectedVerificationNames.map(normalizeSignalName));
  const nextAttempts = collapseInspectionAttempts(
    (report?.proof ?? [])
      .map(attemptFromProofLine)
      .filter((attempt) => attempt && requiredNames.has(normalizeSignalName(attempt.verificationName))),
  );
  if (nextAttempts.length === 0) return;

  saveAttempts(
    projectSlug,
    targetRef,
    scopeId,
    [...loadAttempts(projectSlug, targetRef, scopeId), ...nextAttempts],
  );
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

  const values = Object.fromEntries(new FormData(form).entries());
  const expectedVerificationNames = lines(values.expectedVerificationNames);
  if (expectedVerificationNames.length === 0) {
    renderError('Name at least one required exact-head check before inspecting.');
    return;
  }
  if (values.intentConfirmed !== 'on') {
    renderError('Confirm the exact founder outcome before inspecting.');
    return;
  }

  const projectSlug = String(values.projectSlug ?? '').trim();
  const targetRef = String(values.targetRef ?? '').trim();
  const desiredOutcome = String(values.desiredOutcome ?? '').trim();
  const suspectedFailureArea = String(values.suspectedFailureArea ?? '').trim();
  const firstFilesOrLogs = lines(values.firstFilesOrLogs);
  const scopeId = attemptScopeId({
    desiredOutcome,
    suspectedFailureArea,
    firstFilesOrLogs,
    expectedVerificationNames,
  });
  const payload = {
    projectSlug,
    targetRef,
    desiredOutcome,
    resolvedIntent: desiredOutcome,
    reason: String(values.reason ?? '').trim() || undefined,
    suspectedFailureArea: suspectedFailureArea || undefined,
    constraints: lines(values.constraints),
    firstFilesOrLogs,
    expectedVerificationNames,
    stopCondition: String(values.stopCondition ?? '').trim() || undefined,
    attempts: loadAttempts(projectSlug, targetRef, scopeId),
  };

  submit.disabled = true;
  submit.textContent = 'Inspecting…';
  try {
    const response = await fetch('/goalfix/inspect', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      sessionStorage.removeItem(attemptStorageKey(projectSlug, targetRef, scopeId));
    }
    if (!response.ok) throw new Error(body?.error ?? `Inspection failed (${response.status})`);
    recordVerificationAttempts(
      body,
      projectSlug,
      targetRef,
      scopeId,
      expectedVerificationNames,
    );
    renderReport(body);
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  } finally {
    submit.disabled = false;
    submit.textContent = 'Inspect exact head';
  }
});