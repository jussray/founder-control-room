const root = document.getElementById('friend-root');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  ));
}

async function loadFounderIdentity() {
  const response = await fetch('/auth/me', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const value = payload?.success === true && payload.data ? payload.data : payload;
  return value?.founder ?? null;
}

function renderSignedOut() {
  root.innerHTML = `
    <section class="signin">
      <p class="eyebrow">Founder-only surface</p>
      <h1>Friend needs your founder session.</h1>
      <p class="lead">Sign in through Founder Control Room, then return here.</p>
      <a href="/control-room/">Return to Control Room</a>
    </section>
  `;
}

function formHtml() {
  return `
    <div class="topline">
      <div>
        <p class="eyebrow">Decide · Friend Intake v1</p>
        <h1>One reflection. One move.</h1>
      </div>
      <a class="back" href="/control-room/">Control Room ↗</a>
    </div>
    <p class="lead">Friend mirrors what you mean, keeps the next move bounded, and shows where the result came from. Sensitive inputs stay local and are not sent to an external model.</p>

    <section class="panel">
      <form id="friend-form">
        <div class="grid">
          <label class="full">What is on your mind?
            <textarea name="transcript" maxlength="20000" required placeholder="Drop the thought here. Friend will not retrieve related memories."></textarea>
          </label>

          <label>Runtime
            <select name="provider">
              <option value="deterministic">Deterministic · local</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Claude · Anthropic</option>
              <option value="perplexity">Perplexity · search disabled</option>
            </select>
          </label>

          <label>Time / energy
            <input name="timeEnergyContext" maxlength="500" placeholder="Example: 10 minutes, low energy" />
          </label>

          <label class="full">Voice note for Friend <span class="fine">(optional)</span>
            <input name="voiceProfile" maxlength="2000" placeholder="Example: direct, short, keep my wording" />
          </label>
        </div>

        <fieldset class="privacy">
          <legend class="eyebrow">Privacy choice</legend>
          <label>
            <input type="radio" name="privacyChoice" value="process_without_saving" checked />
            <span>Process without saving <span class="fine">FCR stores no founder content. If you choose a live provider, the submission is still sent to that provider under its own retention policy.</span></span>
          </label>
          <label>
            <input type="radio" name="privacyChoice" value="save_redacted_summary" />
            <span>Save redacted summary <span class="fine">FCR stores only the redacted summary as founder content, never the raw transcript, semantic sensitivity tags, or embeddings. Live-provider handling remains governed by that provider's policy.</span></span>
          </label>
        </fieldset>

        <div class="actions">
          <button id="run-button" type="submit">Run Friend</button>
          <span id="run-status" class="status">Live providers require an interactive founder session, an atomic FCR budget reservation, an allowlisted provider, and a server credential.</span>
        </div>
        <div id="friend-error"></div>
      </form>
    </section>

    <section id="friend-receipt" class="receipt" hidden></section>
  `;
}

function provenanceRows(provenance) {
  const values = [
    ['Source', provenance?.source],
    ['Provider', provenance?.provider],
    ['Model', provenance?.model],
    ['Prompt', provenance?.promptVersion],
    ['Provider response', provenance?.responseId ?? 'not available'],
    ['Budget reservation', provenance?.inferenceReservationId ?? 'not required'],
    ['Provider storage posture', provenance?.providerStorageMode],
    ['Web search used', provenance?.webSearchUsed === true ? 'yes' : 'no'],
  ];

  return values.map(([key, value]) => (
    `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`
  )).join('');
}

function renderReceipt(data) {
  const receipt = document.getElementById('friend-receipt');
  const tags = Array.isArray(data.intentTags) ? data.intentTags : [];
  const move = data.move ?? {};
  const provenance = data.provenance ?? {};
  const doesNotProve = Array.isArray(provenance.doesNotProve)
    ? provenance.doesNotProve.join(' · ')
    : '';

  receipt.hidden = false;
  receipt.innerHTML = `
    <article class="result-card">
      <p class="eyebrow">Mirror</p>
      <h2>${escapeHtml(data.mirror?.headline)}</h2>
      <p>${escapeHtml(data.mirror?.summary)}</p>
      <div class="meta-row">
        <span class="pill">${escapeHtml(data.runtimeProvider)}</span>
        <span class="pill">${escapeHtml(data.modelExecutionState)}</span>
        <span class="pill">${escapeHtml(data.inputPersistence)}</span>
      </div>
    </article>

    <article class="result-card">
      <p class="eyebrow">Editable intent tags</p>
      <div class="tags">
        ${tags.map((tag, index) => (
          `<input class="tag-input" aria-label="Intent tag ${index + 1}" value="${escapeHtml(tag)}" maxlength="20" />`
        )).join('')}
      </div>
      <p class="fine">Edits here are local founder edits in v1. They are not relabeled as model output or persisted automatically.</p>
    </article>

    <article class="result-card move">
      <p class="eyebrow">One move · ${escapeHtml(move.kind)}</p>
      <h2>${escapeHtml(move.text)}</h2>
      ${move.rationale ? `<p>${escapeHtml(move.rationale)}</p>` : ''}
      <div class="meta-row">
        <span class="pill">${move.timeEstimateMinutes ? `${escapeHtml(move.timeEstimateMinutes)} min` : 'No timer'}</span>
        ${move.gateWarning ? `<span class="pill">${escapeHtml(move.gateWarning)}</span>` : ''}
      </div>
    </article>

    <details>
      <summary>Provenance · what this does and does not prove</summary>
      <dl class="provenance-grid">${provenanceRows(provenance)}</dl>
      <p class="fine"><strong>Does not prove:</strong> ${escapeHtml(doesNotProve)}</p>
      <p class="fine">Provenance ID: ${escapeHtml(data.provenanceId)} · Timeline receipt: ${escapeHtml(data.timelineEventId)}</p>
    </details>

    <article class="result-card">
      <p class="eyebrow">Founder outcome</p>
      <h2>Did this move help?</h2>
      <div class="feedback" data-run-id="${escapeHtml(data.runId)}">
        <button class="secondary" data-feedback="yes" type="button">Yes</button>
        <button class="secondary" data-feedback="not_really" type="button">Not really</button>
        <button class="secondary" data-feedback="wrong_time" type="button">Wrong time</button>
      </div>
      <p id="feedback-status" class="status">One response per Friend run.</p>
    </article>
  `;

  receipt.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitFriend(form) {
  const button = document.getElementById('run-button');
  const status = document.getElementById('run-status');
  const errorBox = document.getElementById('friend-error');
  const receipt = document.getElementById('friend-receipt');
  const formData = new FormData(form);

  const payload = {
    transcript: String(formData.get('transcript') ?? ''),
    privacyChoice: String(formData.get('privacyChoice') ?? 'process_without_saving'),
    provider: String(formData.get('provider') ?? 'deterministic'),
    timeEnergyContext: String(formData.get('timeEnergyContext') ?? ''),
    voiceProfile: String(formData.get('voiceProfile') ?? '') || null,
  };

  button.disabled = true;
  status.textContent = 'Running one bounded Friend pass…';
  errorBox.innerHTML = '';
  if (receipt) {
    receipt.hidden = true;
    receipt.innerHTML = '';
  }

  try {
    const response = await fetch('/mirror/friend-intake', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.error || `Friend failed with status ${response.status}`;
      const failureState = typeof body.modelExecutionState === 'string'
        ? body.modelExecutionState
        : null;
      errorBox.innerHTML = `<div class="error" role="alert"><span>${escapeHtml(message)}</span>${failureState ? `<span class="fine"> · Model state: ${escapeHtml(failureState)}</span>` : ''}</div>`;
      status.textContent = failureState
        ? `No successful receipt was created. Model state: ${failureState}.`
        : 'No successful receipt was created.';
      return;
    }

    form.elements.transcript.value = '';
    renderReceipt(body);
    status.textContent = body.runtimeProvider === payload.provider
      ? 'Receipt created.'
      : `Receipt created locally. Requested ${payload.provider}; sensitive-policy override used ${body.runtimeProvider}.`;
  } catch (error) {
    errorBox.innerHTML = `<div class="error" role="alert">${escapeHtml(error instanceof Error ? error.message : 'Friend failed')}</div>`;
    status.textContent = 'No successful receipt was created.';
  } finally {
    button.disabled = false;
  }
}

async function submitFeedback(button) {
  const wrapper = button.closest('[data-run-id]');
  const runId = wrapper?.dataset.runId;
  const responseValue = button.dataset.feedback;
  const status = document.getElementById('feedback-status');
  if (!runId || !responseValue || !status) return;

  for (const peer of wrapper.querySelectorAll('button')) peer.disabled = true;
  status.textContent = 'Recording usefulness…';

  try {
    const response = await fetch(`/mirror/friend-intake/${encodeURIComponent(runId)}/usefulness`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ response: responseValue }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Usefulness could not be recorded');

    button.setAttribute('aria-pressed', 'true');
    status.textContent = 'Usefulness recorded.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Usefulness could not be recorded.';
    for (const peer of wrapper.querySelectorAll('button')) peer.disabled = false;
  }
}

async function boot() {
  const founder = await loadFounderIdentity();
  if (!founder) {
    renderSignedOut();
    return;
  }

  root.innerHTML = formHtml();
  document.getElementById('friend-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitFriend(event.currentTarget);
  });
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.dataset.feedback) {
      submitFeedback(target);
    }
  });
}

boot().catch(() => renderSignedOut());
