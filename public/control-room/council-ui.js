/* FCR Council: proposal-first UI over existing founder-gated API.
 * Do not introduce a new AI provider, repository authority or synthetic receipt.
 */
(() => {
  'use strict';
  const el = (id) => document.getElementById(id);
  const log = el('council-log');
  const form = el('council-form');
  const projectSelect = el('council-project');
  const missionSelect = el('council-mission');
  const send = el('council-send');
  const consent = el('council-consent');
  const status = el('council-status');
  let projects = [];
  let missions = [];
  let busy = false;
  let registryReady = false;
  const renderedReceipts = new Set();

  function bubble(role, message) {
    const node = document.createElement('div');
    node.className = 'council-bubble';
    node.dataset.role = role;
    const heading = document.createElement('strong');
    heading.textContent = role === 'founder' ? 'You' : 'Council · evidence-aware intake';
    const content = document.createElement('div');
    content.textContent = message;
    node.append(heading, content);
    log.append(node);
    log.scrollTop = log.scrollHeight;
  }
  function setStatus(message, kind = 'info') {
    status.textContent = message;
    status.dataset.kind = kind;
  }
  function normalize(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  }
  function slug(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function registeredMatches(name) {
    const normalized = normalize(name);
    const targetSlug = slug(name);
    return projects.filter((p) => normalized && (normalize(p.name) === normalized || p.slug === targetSlug));
  }
  function option(select, value, text) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = text;
    select.append(node);
  }
  function updateMissions() {
    const selected = projectSelect.value;
    missionSelect.replaceChildren();
    option(missionSelect, '', 'No mission selected');
    for (const mission of missions) {
      if (selected && mission.project?.slug !== selected) continue;
      if (!selected) continue;
      option(missionSelect, String(mission.id), mission.title + ' · ' + mission.status);
    }
    consent.checked = false;
  }
  async function api(path, opts = {}) {
    const raw = sessionStorage.getItem('fcr_session');
    let session;
    try { session = JSON.parse(raw || 'null'); } catch { session = null; }
    if (!session?.access_token) throw new Error('A founder session is required. Open Control Room to sign in.');
    const response = await fetch(path, {
      ...opts,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    });
    let body = null;
    try { body = await response.json(); } catch { /* retain HTTP error */ }
    if (!response.ok) throw new Error(body?.error || 'Council request failed (HTTP ' + response.status + ').');
    return body;
  }
  async function boot() {
    bubble('council', 'Tell me the intended outcome. We will establish which project owns it, what is true, and what needs proof before any build. You decide at every change gate.\n\nI can prepare an idea without sending it to an AI provider. A live Council round is available only after you select an existing mission and explicitly approve the advisory request.');
    try {
      const [p, m] = await Promise.all([api('/projects'), api('/dashboard/tasks')]);
      projects = Array.isArray(p.projects) ? p.projects : [];
      missions = Array.isArray(m.tasks) ? m.tasks : [];
      registryReady = true;
      for (const project of projects) option(projectSelect, project.slug, project.name + ' · ' + project.slug);
      setStatus('Registry and missions read. No writes made.');
    } catch (error) {
      setStatus(error.message || String(error), 'error');
    }
  }
  projectSelect.addEventListener('change', updateMissions);
  async function loadMissionHistory() {
    const missionId = missionSelect.value;
    const projectSlug = projectSelect.value;
    if (!missionId) return;
    const mission = missions.find((item) => String(item.id) === missionId);
    if (!mission || mission.project?.slug !== projectSlug) {
      setStatus('Cannot read Council history: mission and project identity disagree.', 'error');
      return;
    }
    try {
      const response = await api('/missions/' + encodeURIComponent(missionId) + '/council');
      // Ignore late replies after the founder switches project or mission.
      if (missionSelect.value !== missionId || projectSelect.value !== projectSlug) return;
      const rounds = Array.isArray(response.conversations) ? response.conversations : [];
      for (const round of rounds) {
        const key = missionId + ':' + (round.id || round.round);
        if (renderedReceipts.has(key)) continue;
        renderedReceipts.add(key);
        bubble('council', 'Recorded Council history for ' + projectSlug +
          '\nMission: ' + mission.title +
          '\nRound: ' + (round.round ?? 'unknown') +
          '; receipt: ' + (round.id ?? 'unavailable') +
          '\nResult: ' + (round.outcome || 'No verified outcome recorded.'));
      }
      setStatus(rounds.length ? 'Council history loaded from the mission ledger.' : 'No prior Council rounds for this mission.');
    } catch (error) {
      if (missionSelect.value === missionId) setStatus('Council history unavailable: ' + (error.message || String(error)), 'error');
    }
  }
  missionSelect.addEventListener('change', () => {
    consent.checked = false;
    void loadMissionHistory();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const goal = el('council-prompt').value.trim();
    const name = el('council-name').value.trim();
    const selectedProject = projectSelect.value;
    const missionId = missionSelect.value;
    if (!goal) { setStatus('Describe your goal first.', 'error'); return; }
    if (!registryReady) { setStatus('Project identity has not been verified. Reload or sign in before Council can advise on a project.', 'error'); return; }
    const selectedMission = missions.find((m) => String(m.id) === missionId);
    if (missionId && (!selectedMission || selectedMission.project?.slug !== selectedProject)) {
      setStatus('Project and mission identity disagree. Re-select them before proceeding.', 'error');
      return;
    }
    if (missionId && !consent.checked) {
      setStatus('Approve the exact advisory Council round before connecting providers.', 'error');
      return;
    }
    const matches = registeredMatches(name);
    bubble('founder', goal + (name ? '\nProject idea: ' + name : '') + (selectedProject ? '\nSelected project: ' + selectedProject : ''));
    if (matches.length > 0 && (!selectedProject || matches.every((p) => p.slug !== selectedProject))) {
      bubble('council', 'POTENTIAL PROJECT MATCH: ' + matches.map((p) => p.name + ' (' + p.slug + ')').join(', ') + '.\n\nThree choices before anything changes:\n1. Reuse and inspect the existing project.\n2. Explain why the idea must be separate and confirm a new identity.\n3. Stop and clarify the intended owner.\n\nNo project was registered or duplicated.');
      setStatus('Identity conflict: approval and clarification required.');
      return;
    }
    if (!missionId) {
      bubble('council', 'Idea intake, not an AI-generated diagnosis or an approved build.\n\nPlease confirm:\n• Who will use it, and what should it accomplish?\n• Does it belong to an existing project or require a genuinely new one?\n• What evidence will prove the first useful result?\n\nThree safe next paths:\n1. Reuse and extend an existing project, after scope approval.\n2. Confirm a distinct name, owner and first build gate.\n3. Research or prototype the idea without making repository changes.\n\nAfter design approval, use a real browser capture of the completed build, not an imagined success image.');
      setStatus('Prepared only. Choose a project and mission for a live Council round.');
      return;
    }
    busy = true;
    send.disabled = true;
    setStatus('Running founder-approved advisory Council round…');
    try {
      const response = await api('/missions/' + encodeURIComponent(missionId) + '/council/run', {
        method: 'POST',
        body: JSON.stringify({ goal, seed: goal, capability: 'propose', sensitivity: 'internal', sourceRef: 'fcr-council-ui:' + selectedProject }),
      });
      const c = response.conversation;
      if (c?.id) renderedReceipts.add(missionId + ':' + c.id);
      const summary = c?.outcome ? String(c.outcome) : 'No verified summary was returned. Inspect the persisted Council record before relying on this run.';
      bubble('council', 'Council response for ' + selectedMission.title + ':\n' + summary + '\n\nRound: ' + (c?.round ?? 'unknown') + '; receipt: ' + (c?.id ?? 'unavailable') + '.\nNo repository, connector or publication action was authorized by this advisory round.');
      setStatus('Council returned an advisory record. Execution requires a separate exact-action approval.');
    } catch (error) {
      bubble('council', 'Council could not confirm the round: ' + (error.message || String(error)) + '. No success is claimed. Check the mission receipt before retrying.');
      setStatus('Council run unresolved. No build authorized.', 'error');
    } finally {
      busy = false;
      send.disabled = false;
      consent.checked = false;
    }
  });
  void boot();
})();
