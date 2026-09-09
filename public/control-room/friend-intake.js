const root = document.getElementById('friend-intake-root');
let activeReceipt = null;

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
  const founder = payload?.data?.founder ?? payload?.founder ?? null;
  const email = typeof founder?.email === 'string' ? founder.email.trim().toLowerCase() : '';
  return email ? { email } : null;
}

function renderSignedOut() {
  root.innerHTML = `
    <section class="signin">
      <p class="eyebrow">Founder-only surface</p>
      <h1>Founder session required.</h1>
      <p class="muted">Friend Intake stays behind the same Founder Control Room session boundary as the rest of the operating surface.</p>
      <a href="/control-room/">Return to sign in</a>
    </section>
  `;
}

function privacyMessage(choice) {
  return choice === 'save_redacted_summary'
    ? 'A bounded category-level summary plus operational receipt metadata may be saved. Raw input is not stored. Sensitive saves require a review before persistence.'
    : 'Raw input and derived intake labels are not stored. A behavior-only timeline receipt is recorded.';
}

function renderForm(founder) {
  root.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Decide · first slice</p>
      <h1>Move one thing forward.</h1>
      <p>Share what is on your mind. FCR will use a deterministic, model-free first pass to mirror the situation, label it, and offer exactly one next move.</p>
    </section>

    <section class="panel">
      <h2>Friend Intake</h2>
      <form id="friend-intake-form">
        <label for="friend-input">What is going on?</label>
        <textarea id="friend-input" name="rawText" maxlength="20000" required autocomplete="off" placeholder="Write it in your own words."></textarea>

        <fieldset class="privacy-group">
          <legend>Privacy choice</legend>
          <label class="privacy-option">
            <input type="radio" name="privacyChoice" value="process_without_saving" checked />
            <span>Process without saving<small>Primary mode. No intake-content row is created.</small></span>
          </label>
          <label class="privacy-option">
            <input type="radio" name="privacyChoice" value="save_redacted_summary" />
            <span>Save redacted summary<small>Stores only a bounded category-level summary, never your raw text.</small></span>
          </label>
        </fieldset>

        <p id="privacy-note" class="privacy-note">${escapeHtml(privacyMessage('process_without_saving'))}</p>

        <div class="actions">
          <button class="primary" type="submit">Mirror and give me one move</button>
          <button class="secondary" id="cancel-intake" type="button">Cancel and clear</button>
        </div>
        <p id="friend-intake-error" class="error" hidden></p>
      </form>
      <p class="muted">Signed in as ${escapeHtml(founder.email)}. This slice does not call an external AI model or retrieve related memory.</p>
    </section>

    <section id="friend-intake-result" aria-live="polite"></section>
  `;

  const form = root.querySelector('#friend-intake-form');
  const privacyNote = root.querySelector('#privacy-note');
  form.addEventListener('change', (event) => {
    if (event.target?.name === 'privacyChoice') {
      privacyNote.textContent = privacyMessage(event.target.value);
      root.querySelector('#friend-intake-result').innerHTML = '';
      activeReceipt = null;
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitIntake(form);
  });
  root.querySelector('#cancel-intake').addEventListener('click', () => {
    form.reset();
    privacyNote.textContent = privacyMessage('process_without_saving');
    root.querySelector('#friend-intake-result').innerHTML = '';
    root.querySelector('#friend-input').focus();
    activeReceipt = null;
  });
}

async function submitIntake(form, options = {}) {
  const error = root.querySelector('#friend-intake-error');
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const rawText = String(data.get('rawText') ?? '').trim();
  const privacyChoice = String(data.get('privacyChoice') ?? '');

  error.hidden = true;
  error.textContent = '';
  button.disabled = true;

  try {
    const response = await fetch('/friend-intake/run', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText,
        privacyChoice,
        sensitiveSaveConfirmed: options.sensitiveSaveConfirmed === true,
      }),
    });
    const body = await response.json().catch(() => null);

    if (response.status === 401) {
      renderSignedOut();
      return;
    }
    if (response.status === 404) {
      throw new Error('Friend Intake is currently disabled on this runtime.');
    }
    if (
      response.status === 409
      && body?.code === 'SENSITIVE_SAVE_REVIEW_REQUIRED'
      && typeof body?.review?.redactedSummary === 'string'
    ) {
      activeReceipt = null;
      renderSensitiveSaveReview(form, body.review, rawText);
      return;
    }
    if (!response.ok || !body?.receipt) {
      throw new Error(body?.error ?? `Friend Intake failed (${response.status}).`);
    }

    activeReceipt = body.receipt;
    renderReceipt(activeReceipt);
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : String(caught);
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}

function renderSensitiveSaveReview(form, review, reviewedRawText) {
  const mount = root.querySelector('#friend-intake-result');
  mount.innerHTML = `
    <article class="result-card" data-sensitive-save-review>
      <p class="eyebrow">Privacy review</p>
      <h2>Sensitive content detected.</h2>
      <p>Nothing has been saved yet. Review the bounded summary below before deciding whether to store it.</p>
      <section class="receipt-section">
        <h3>What would be saved</h3>
        <p>${escapeHtml(review.redactedSummary)}</p>
        <p class="muted">Raw input, Mirror text, and Move text will not be stored.</p>
      </section>
      <div class="actions">
        <button class="primary" data-confirm-sensitive-save type="button">Save this redacted summary</button>
        <button class="secondary" data-process-unsaved type="button">Process without saving instead</button>
      </div>
      <p class="feedback-status" data-sensitive-review-status></p>
    </article>
  `;

  const status = mount.querySelector('[data-sensitive-review-status]');
  mount.querySelector('[data-confirm-sensitive-save]').addEventListener('click', () => {
    const currentRawText = String(new FormData(form).get('rawText') ?? '').trim();
    if (currentRawText !== reviewedRawText) {
      status.textContent = 'The input changed after review. Run Friend Intake again before saving.';
      return;
    }
    void submitIntake(form, { sensitiveSaveConfirmed: true });
  });

  mount.querySelector('[data-process-unsaved]').addEventListener('click', () => {
    const unsavedChoice = form.querySelector('input[value="process_without_saving"]');
    unsavedChoice.checked = true;
    root.querySelector('#privacy-note').textContent = privacyMessage('process_without_saving');
    void submitIntake(form);
  });
}

function editableTags(tags) {
  return tags.map((tag, index) => `
    <label class="tag-chip">
      <span class="visually-hidden">Intent tag ${index + 1}</span>
      <input value="${escapeHtml(tag)}" maxlength="24" aria-label="Intent tag ${index + 1}" />
    </label>
  `).join('');
}

function renderReceipt(receipt) {
  const mount = root.querySelector('#friend-intake-result');
  const move = receipt.move ?? {};
  const privacyText = receipt.inputPersistence === 'none'
    ? 'No intake content saved'
    : 'Redacted summary only';

  mount.innerHTML = `
    <article class="result-card" data-friend-intake-receipt>
      <p class="eyebrow">Mirror</p>
      <h2>${escapeHtml(receipt.mirror?.headline)}</h2>
      <p class="muted">${escapeHtml(receipt.mirror?.summary)}</p>

      <div class="receipt-grid">
        <section class="receipt-section">
          <h3>Intent tags</h3>
          <div class="tag-list" data-intent-tags>${editableTags(receipt.intentTags ?? [])}</div>
          <p class="muted">Editable here for your thinking. This first slice does not silently rewrite the stored receipt after the run.</p>
        </section>

        <section class="receipt-section move-card" data-one-move>
          <h3>Exactly one Move</h3>
          <strong>${escapeHtml(move.kind)}</strong>
          <p>${escapeHtml(move.actionText)}</p>
          ${move.timeEstimateMinutes === null ? '' : `<p class="muted">About ${escapeHtml(move.timeEstimateMinutes)} minutes.</p>`}
          ${move.gateWarning ? `<p class="muted">${escapeHtml(move.gateWarning)}</p>` : ''}
        </section>

        <section class="receipt-section">
          <h3>Privacy receipt</h3>
          <p><strong>${escapeHtml(privacyText)}</strong></p>
          <p class="muted">Timeline receipt contains policy metadata, not your input, mirror text, or Move text.</p>
        </section>

        <section class="receipt-section provenance">
          <h3>Provenance</h3>
          <p>Deterministic FCR rule engine. External model state: <strong>${escapeHtml(receipt.modelExecutionState)}</strong>.</p>
          <details>
            <summary>Technical detail</summary>
            <p>Run: <code>${escapeHtml(receipt.runId)}</code></p>
            <p>Provenance: <code>${escapeHtml(receipt.provenance?.id)}</code></p>
            <p>Timeline event: <code>${escapeHtml(receipt.timeline?.eventId)}</code></p>
            <p>External model called: <code>${escapeHtml(receipt.provenance?.externalModelCalled)}</code></p>
            <p>Related memory used: <code>${escapeHtml(receipt.provenance?.relatedMemoryUsed)}</code></p>
          </details>
        </section>

        <section class="receipt-section full feedback">
          <h3>Did this move help?</h3>
          <div class="feedback-row">
            <button class="feedback-button" data-feedback="yes" type="button">Yes, helped</button>
            <button class="feedback-button" data-feedback="not_really" type="button">Not really</button>
            <button class="feedback-button" data-feedback="wrong_time" type="button">Wrong time</button>
          </div>
          <p class="feedback-status" data-feedback-status></p>
        </section>
      </div>
    </article>
  `;

  mount.querySelectorAll('[data-feedback]').forEach((button) => {
    button.addEventListener('click', () => void submitUsefulness(button.dataset.feedback));
  });
}

async function submitUsefulness(responseValue) {
  if (!activeReceipt?.runId) return;
  const mount = root.querySelector('#friend-intake-result');
  const status = mount.querySelector('[data-feedback-status]');
  const buttons = [...mount.querySelectorAll('[data-feedback]')];
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = 'Recording usefulness receipt…';

  try {
    const response = await fetch('/friend-intake/usefulness', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: activeReceipt.runId, response: responseValue }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? `Usefulness receipt failed (${response.status}).`);

    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.feedback === responseValue ? 'true' : 'false');
    });
    status.textContent = 'Usefulness receipt recorded.';
  } catch (caught) {
    status.textContent = caught instanceof Error ? caught.message : String(caught);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

const founder = await loadFounderIdentity().catch(() => null);
if (founder) renderForm(founder);
else renderSignedOut();
