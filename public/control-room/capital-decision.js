const STORAGE_KEY = 'fcr_session';
const root = document.getElementById('capital-root');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
  ));
}

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
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dollarsToCents(value) {
  const normalized = String(value ?? '').trim().replaceAll(',', '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const dollars = Number(whole);
  if (!Number.isSafeInteger(dollars)) return null;
  const cents = dollars * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

function isoFromLocal(value) {
  const parsed = new Date(String(value ?? ''));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function localDateTimeValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatMoney(cents, currency) {
  if (!Number.isSafeInteger(cents) || !currency) return 'Unavailable';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toLocaleString()}`;
  }
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : 'Unavailable';
}

function listHtml(values, emptyText = 'None') {
  if (!Array.isArray(values) || values.length === 0) {
    return `<li>${escapeHtml(emptyText)}</li>`;
  }
  return values.map((value) => `<li>${escapeHtml(value)}</li>`).join('');
}

function renderSignedOut() {
  root.innerHTML = `
    <section class="signin">
      <p class="eyebrow">Founder-only surface</p>
      <h1>Founder session required.</h1>
      <p class="muted">Capital decisions stay behind the same Founder Control Room session boundary as the rest of the operating surface.</p>
      <a href="/control-room/">Return to sign in</a>
    </section>
  `;
}

function renderForm(session) {
  const now = new Date();
  const observed = new Date(now.getTime() - 60 * 60 * 1000);

  root.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Founder Decision Card · Attack 1000</p>
        <h1>Capital should buy proof, not erase options.</h1>
        <p>Preview the financing path as a governed decision: capital → milestone → runway → dilution → term burden → options lost or gained → next financing trigger.</p>
      </div>
      <aside class="authority-note">
        <p class="eyebrow">Authority ceiling</p>
        <strong>No financing authority is granted here.</strong>
        <p>This screen evaluates evidence. It cannot spend, contact investors, fundraise, merge, publish, deploy, or execute.</p>
      </aside>
    </section>

    <section class="panel">
      <h2>Capital decision input</h2>
      <p class="panel-intro">Default evidence state is INFERRED. Select VERIFIED only when the values are backed by the evidence references you provide.</p>
      <form id="capital-form">
        <fieldset>
          <legend>Decision scope</legend>
          <div class="grid">
            <label>Decision ID
              <input name="decisionId" required placeholder="seed-round-1" />
            </label>
            <label>Project ID
              <input name="projectId" required placeholder="founder-control-room" />
            </label>
            <label>Legal entity ID
              <input name="legalEntityId" required placeholder="company-llc" />
            </label>
            <label>Capital lane
              <input name="capitalLaneId" required placeholder="seed" />
            </label>
            <label class="full">Milestone this capital unlocks
              <input name="milestoneUnlocked" required placeholder="Prove 100 paying customers" />
            </label>
            <label class="full">Next financing trigger
              <input name="nextFinancingTrigger" required placeholder="Raise again only after the milestone is independently evidenced" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Capital and freshness</legend>
          <div class="grid three">
            <label>Currency
              <input name="currency" maxlength="3" required value="USD" />
            </label>
            <label>Pre-money valuation
              <input name="preMoneyDollars" inputmode="decimal" required placeholder="10000000" />
            </label>
            <label>Capital needed
              <input name="raiseAmountDollars" inputmode="decimal" required placeholder="3000000" />
            </label>
            <label>Expected runway (months)
              <input name="expectedRunwayMonths" type="number" min="0" max="120" step="0.5" required value="12" />
            </label>
            <label>Founder dilution ceiling (%)
              <input name="maxDilutionPct" type="number" min="0" max="100" step="0.01" required value="25" />
            </label>
            <label>Max evidence age (days)
              <input name="maxEvidenceAgeDays" type="number" min="0" max="3650" step="1" required value="30" />
            </label>
            <label>Evidence observed at
              <input name="observedAt" type="datetime-local" required value="${escapeHtml(localDateTimeValue(observed))}" />
            </label>
            <label>Decision as-of time
              <input name="asOf" type="datetime-local" required value="${escapeHtml(localDateTimeValue(now))}" />
            </label>
            <label>Evidence state
              <select name="classification" required>
                <option value="INFERRED" selected>INFERRED</option>
                <option value="VERIFIED">VERIFIED</option>
                <option value="UNKNOWN">UNKNOWN</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Terms and future options</legend>
          <div class="grid">
            <label>Instrument
              <input name="instrument" required placeholder="SAFE, note, priced round…" />
            </label>
            <label>Evidence references, one per line
              <textarea name="evidenceRefs" required placeholder="evidence:term-sheet-draft&#10;evidence:cap-table"></textarea>
            </label>
            <label>Viable options before, one per line
              <textarea name="optionsBefore" required placeholder="80M strategic exit&#10;remain independent"></textarea>
            </label>
            <label>Viable options after, one per line
              <textarea name="optionsAfter" required placeholder="remain independent&#10;follow-on institutional round"></textarea>
            </label>
          </div>
          <div class="check-row">
            <label><input name="economicRightsKnown" type="checkbox" /> Economic rights known</label>
            <label><input name="controlRightsKnown" type="checkbox" /> Control / governance rights known</label>
          </div>
        </fieldset>

        <div class="actions">
          <p>Signed in as ${escapeHtml(session.email || 'founder')}. This is a non-persistent preview and is returned with <code>Cache-Control: no-store</code>.</p>
          <button class="primary" type="submit">Evaluate optionality</button>
        </div>
        <p id="capital-error" class="error" hidden></p>
      </form>
    </section>

    <section id="capital-result" aria-live="polite"></section>
  `;

  root.querySelector('#capital-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void submitCapitalPreview(event.currentTarget, session);
  });
}

async function submitCapitalPreview(form, session) {
  const error = root.querySelector('#capital-error');
  const button = form.querySelector('button[type="submit"]');
  error.hidden = true;
  error.textContent = '';
  button.disabled = true;

  try {
    const data = new FormData(form);
    const preMoneyCents = dollarsToCents(data.get('preMoneyDollars'));
    const raiseAmountCents = dollarsToCents(data.get('raiseAmountDollars'));
    const asOf = isoFromLocal(data.get('asOf'));
    const observedAt = isoFromLocal(data.get('observedAt'));

    if (preMoneyCents === null || raiseAmountCents === null || !asOf || !observedAt) {
      throw new Error('Money and evidence timestamps must be valid before this preview can run.');
    }

    const payload = {
      decisionId: String(data.get('decisionId') ?? '').trim(),
      projectId: String(data.get('projectId') ?? '').trim(),
      legalEntityId: String(data.get('legalEntityId') ?? '').trim(),
      capitalLaneId: String(data.get('capitalLaneId') ?? '').trim(),
      milestoneUnlocked: String(data.get('milestoneUnlocked') ?? '').trim(),
      nextFinancingTrigger: String(data.get('nextFinancingTrigger') ?? '').trim(),
      expectedRunwayMonths: Number(data.get('expectedRunwayMonths')),
      currency: String(data.get('currency') ?? '').trim().toUpperCase(),
      preMoneyCents,
      raiseAmountCents,
      asOf,
      observedAt,
      maxEvidenceAgeDays: Number(data.get('maxEvidenceAgeDays')),
      instrument: String(data.get('instrument') ?? '').trim(),
      economicRightsKnown: data.get('economicRightsKnown') === 'on',
      controlRightsKnown: data.get('controlRightsKnown') === 'on',
      optionsBefore: lines(data.get('optionsBefore')),
      optionsAfter: lines(data.get('optionsAfter')),
      classification: String(data.get('classification') ?? ''),
      evidenceRefs: lines(data.get('evidenceRefs')),
      maxDilutionPct: Number(data.get('maxDilutionPct')),
    };

    const response = await fetch('/founder-os/capital-preview', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);

    if (response.status === 401) {
      sessionStorage.removeItem(STORAGE_KEY);
      renderSignedOut();
      return;
    }
    if (!response.ok || !body?.card) {
      throw new Error(body?.error ?? `Capital preview failed (${response.status}).`);
    }

    renderCard(body.card);
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : String(caught);
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}

function renderCard(card) {
  const mount = root.querySelector('#capital-result');
  const currency = card.capital?.currency;
  const diagnostics = [
    ...(card.diagnostics?.terms ?? []),
    ...(card.diagnostics?.termBurden ?? []),
    ...(card.diagnostics?.optionality ?? []),
  ];
  const reasons = [...new Set([...(card.verdict?.reasons ?? []), ...diagnostics])];

  mount.innerHTML = `
    <article class="result-card" data-capital-decision-card>
      <header class="result-head">
        <div>
          <p class="eyebrow">${escapeHtml(card.contract)}</p>
          <h2>${escapeHtml(card.decisionId)}</h2>
          <span class="muted">${escapeHtml(card.scope?.legalEntityId ?? 'scope unavailable')} · ${escapeHtml(card.scope?.capitalLaneId ?? 'lane unavailable')}</span>
        </div>
        <span class="badge" data-state="${escapeHtml(card.verdict?.state)}">${escapeHtml(card.verdict?.state)}</span>
      </header>

      <div class="metrics">
        <div class="metric">
          <span>Capital needed</span>
          <strong>${escapeHtml(formatMoney(card.capital?.capitalNeededCents, currency))}</strong>
        </div>
        <div class="metric">
          <span>Implied dilution</span>
          <strong>${escapeHtml(formatPercent(card.capital?.impliedDilutionPct))}</strong>
        </div>
        <div class="metric">
          <span>Retained ownership</span>
          <strong>${escapeHtml(formatPercent(card.capital?.retainedOwnershipPct))}</strong>
        </div>
        <div class="metric">
          <span>Optionality</span>
          <strong>${escapeHtml(card.optionality?.state)}</strong>
        </div>
      </div>

      <div class="result-grid">
        <section class="result-section">
          <h3>Proof point</h3>
          <div class="kv">
            <span><strong>Milestone:</strong> ${escapeHtml(card.planning?.milestoneUnlocked)}</span>
            <span><strong>Expected runway:</strong> ${escapeHtml(card.planning?.expectedRunwayMonths)} months</span>
            <span><strong>Next financing trigger:</strong> ${escapeHtml(card.planning?.nextFinancingTrigger)}</span>
          </div>
        </section>

        <section class="result-section">
          <h3>Term burden</h3>
          <div class="kv">
            <span><strong>Instrument:</strong> ${escapeHtml(card.termBurden?.instrument ?? 'Unavailable')}</span>
            <span><strong>Completeness:</strong> ${escapeHtml(card.termBurden?.completeness)}</span>
            <span><strong>Evidence state:</strong> ${escapeHtml(card.termBurden?.classification)}</span>
          </div>
        </section>

        <section class="result-section">
          <h3>Options preserved / added</h3>
          <ul>${listHtml([...(card.optionality?.preservedOptions ?? []), ...(card.optionality?.addedOptions ?? [])])}</ul>
        </section>

        <section class="result-section">
          <h3>Options weakened</h3>
          <ul>${listHtml(card.optionality?.weakenedOptions ?? [])}</ul>
        </section>

        <section class="result-section">
          <h3>Decision reasons</h3>
          <ul>${listHtml(reasons, 'No blocking reasons recorded')}</ul>
        </section>

        <section class="result-section">
          <h3>Evidence references</h3>
          <ul>${listHtml(card.proof?.evidenceRefs ?? [], 'No evidence references')}</ul>
        </section>
      </div>

      <p class="authority-lock">🔐 No financing authority granted. Fundraise: ${escapeHtml(card.authority?.authorizesFundraise)} · Spend: ${escapeHtml(card.authority?.authorizesSpend)} · External contact: ${escapeHtml(card.authority?.authorizesExternalContact)}</p>
      <div class="next-move">
        <p class="eyebrow">Next gate</p>
        <p>${escapeHtml(card.nextMove)}</p>
      </div>
    </article>
  `;
}

const session = loadSession();
if (!session?.access_token) renderSignedOut();
else renderForm(session);
