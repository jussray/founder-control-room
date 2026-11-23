(() => {
  const byId = (id) => document.getElementById(id);
  const ui = {
    runtimeState: byId('runtimeState'),
    relayState: byId('relayState'),
    activeRooms: byId('activeRooms'),
    connectedPlayers: byId('connectedPlayers'),
    roomsObserved: byId('roomsObserved'),
    eventsRecorded: byId('eventsRecorded'),
    repository: byId('repository'),
    runtimeSha: byId('runtimeSha'),
    runtimeBuild: byId('runtimeBuild'),
    releaseGate: byId('releaseGate'),
    controlFingerprint: byId('controlFingerprint'),
    continuityCookie: byId('continuityCookie'),
    eventFeed: byId('eventFeed'),
    refreshButton: byId('refreshButton'),
    updatedAt: byId('updatedAt'),
  };

  function formatTime(value) {
    const date = new Date(value || 0);
    if (!value || Number.isNaN(date.getTime())) return 'unknown';
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);
  }

  function short(value, length = 12) {
    if (!value) return 'not-issued';
    return value.length > length ? `${value.slice(0, length)}…` : value;
  }

  function setRuntimeState(state) {
    ui.runtimeState.classList.remove('good', 'warn', 'bad');
    if (state === 'VERIFIED') {
      ui.runtimeState.textContent = 'RUNTIME VERIFIED';
      ui.runtimeState.classList.add('good');
      return;
    }
    if (state === 'ERROR') {
      ui.runtimeState.textContent = 'RELAY ERROR';
      ui.runtimeState.classList.add('bad');
      return;
    }
    ui.runtimeState.textContent = 'LOCAL / UNVERIFIED';
    ui.runtimeState.classList.add('warn');
  }

  function renderEvents(events) {
    ui.eventFeed.replaceChildren();
    if (!Array.isArray(events) || events.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No SYNC lifecycle signals observed yet.';
      ui.eventFeed.appendChild(empty);
      return;
    }

    for (const event of [...events].reverse().slice(0, 14)) {
      const row = document.createElement('div');
      row.className = 'event';
      const name = document.createElement('strong');
      name.textContent = event?.event || 'UNKNOWN';
      const meta = document.createElement('span');
      meta.textContent = `room ${short(event?.room_fingerprint, 10)} · ${event?.phase || 'unknown'} · ${event?.connected_players ?? 0} connected`;
      const time = document.createElement('time');
      time.textContent = formatTime(event?.at);
      row.append(name, meta, time);
      ui.eventFeed.appendChild(row);
    }
  }

  function render(envelope) {
    const runtime = envelope?.runtime || {};
    const authority = envelope?.authority || {};
    const control = envelope?.control || {};

    setRuntimeState(runtime.status);
    ui.relayState.textContent = 'FCR RELAY VERIFIED';
    ui.relayState.classList.add('good');
    ui.activeRooms.textContent = String(control.active_rooms || 0);
    ui.connectedPlayers.textContent = String(control.connected_players || 0);
    ui.roomsObserved.textContent = String(control.rooms_observed || 0);
    ui.eventsRecorded.textContent = String(control.events_recorded || 0);
    ui.repository.textContent = authority.repository || 'jussray/sync-party-game';
    ui.runtimeSha.textContent = runtime.sha || 'unknown';
    ui.runtimeBuild.textContent = runtime.build || 'unknown';
    ui.releaseGate.textContent = authority.release_gate || 'core-proof → exact green SHA → production';
    ui.controlFingerprint.textContent = control.control_fingerprint || 'not-issued';
    ui.continuityCookie.textContent = control.continuity_cookie || 'not-issued';
    ui.updatedAt.textContent = `Refreshed ${formatTime(envelope.generated_at || Date.now())}`;
    renderEvents(control.recent_events);
  }

  async function refresh() {
    ui.refreshButton.disabled = true;
    ui.refreshButton.textContent = 'Refreshing…';
    try {
      const response = await fetch('/api/project-control/sync', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `SYNC relay failed (${response.status})`);
      render(body);
    } catch (error) {
      setRuntimeState('ERROR');
      ui.relayState.textContent = 'FCR RELAY BLOCKED';
      ui.relayState.classList.remove('good');
      ui.relayState.classList.add('bad');
      ui.updatedAt.textContent = error?.message || 'SYNC relay unavailable';
    } finally {
      ui.refreshButton.disabled = false;
      ui.refreshButton.textContent = 'Refresh';
    }
  }

  ui.refreshButton.addEventListener('click', refresh);
  refresh();
  window.setInterval(refresh, 10_000);
})();
