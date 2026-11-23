(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let current = null;
  let busy = false;
  let started = false;
  let confirmed = false;
  const endpoint = '/auth/member/projects';
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(endpoint + path, {
        credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      });
      if (response.status === 401 || response.status === 403) { location.replace('/welcome'); throw Error('Sign in again to continue.'); }
      const payload = await response.json();
      if (!response.ok || payload.success !== true) throw Error(payload.error?.message || 'Request could not be confirmed.');
      return payload.data;
    } finally { clearTimeout(timeout); }
  }
  function validProject(project) {
    return project && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(project.id) &&
      typeof project.title === 'string' && typeof project.goal === 'string' && Number.isSafeInteger(project.version) && project.version > 0;
  }
  function status(message, retry = false) { $('project-status').textContent = message; $('project-retry').hidden = !retry; }
  function clearResume() { const url = new URL(location.href); url.searchParams.delete('project'); history.replaceState(null, '', url); }
  function unsaved() { return !$('project-editor').hidden && ($('project-title').value !== (current?.title || '') || $('project-goal').value !== (current?.goal || '')); }
  function canLeave() { return !unsaved() || window.confirm('Leave these unsaved changes?'); }
  function edit(project) {
    current = project; $('project-editor').hidden = false;
    $('editor-title').textContent = project ? 'Move your project forward' : 'Start with one outcome';
    $('project-title').value = project?.title || ''; $('project-goal').value = project?.goal || '';
    $('project-save').textContent = project ? 'Save project' : 'Create project'; $('project-feedback').textContent = '';
    if (project) { const url = new URL(location.href); url.searchParams.set('project', project.id); history.replaceState(null, '', url); }
    else clearResume();
    $('project-title').focus();
  }
  async function resume(id) {
    if (busy || !canLeave()) return;
    busy = true;
    try {
      const data = await api('/' + encodeURIComponent(id));
      if (!validProject(data.project)) throw Error('Project response was not recognized.');
      edit(data.project);
    } catch (error) { status(error.message || 'Project could not be loaded.', true); }
    finally { busy = false; }
  }
  async function load() {
    confirmed = false; $('new-project').disabled = true;
    status('Loading your projects…'); $('project-list').replaceChildren();
    try {
      const data = await api('');
      if (!Array.isArray(data.projects) || !data.projects.every(validProject)) throw Error('Project response was not recognized.');
      confirmed = true; $('new-project').disabled = false;
      $('project-start').hidden = data.projects.length > 0;
      status(data.projects.length ? 'Choose a project to continue.' : 'No projects yet. Start with one outcome.');
      for (const project of data.projects) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'project-item';
        button.textContent = project.title + ' →'; button.addEventListener('click', () => resume(project.id));
        button.dataset.projectId = project.id;
        $('project-list').appendChild(button);
      }
      const id = new URL(location.href).searchParams.get('project');
      if (id && $('project-editor').hidden) await resume(id);
    } catch (error) { $('project-start').hidden = true; status(error.message || 'Projects could not be loaded.', true); }
  }
  $('new-project').addEventListener('click', () => { if (confirmed && !busy && canLeave()) edit(null); });
  $('project-close').addEventListener('click', () => {
    if (busy) return;
    if (!canLeave()) return;
    $('project-editor').hidden = true; current = null; clearResume();
  });
  $('project-retry').addEventListener('click', () => { if (!busy) void load(); });
  $('project-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !confirmed) return;
    const title = $('project-title').value.trim(), goal = $('project-goal').value;
    if (!title || title.length > 120 || goal.length > 4000) { $('project-feedback').textContent = 'Enter a project name and a goal of up to 4000 characters.'; return; }
    busy = true; $('project-save').disabled = true; $('project-feedback').textContent = 'Saving…';
    try {
      const data = await api(current ? '/' + current.id : '', { method: current ? 'PATCH' : 'POST',
        body: JSON.stringify({ title, goal, ...(current ? { version: current.version } : {}) }) });
      if (!validProject(data.project)) throw Error('Save response was not recognized. Reload projects before trying again.');
      edit(data.project); $('project-feedback').textContent = 'Saved to your workspace.';
      // Reload the list without starting a second resume request during this save.
      const listButton = document.createElement('button'); listButton.type = 'button'; listButton.className = 'project-item';
      listButton.textContent = data.project.title + ' →'; listButton.addEventListener('click', () => resume(data.project.id));
      const existing = Array.from($('project-list').children).find(node => node.dataset.projectId === data.project.id);
      listButton.dataset.projectId = data.project.id;
      if (existing) existing.replaceWith(listButton); else $('project-list').prepend(listButton);
      $('project-start').hidden = true; status('Choose a project to continue.');
    } catch (error) { $('project-feedback').textContent = (error.message || 'Save could not be confirmed.') + ' Your changes remain in this form.'; }
    finally { busy = false; $('project-save').disabled = false; }
  });
  function start() { if (started || $('workspace').hidden) return; started = true; void load(); }
  window.addEventListener('beforeunload', event => { if (unsaved()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('fcr-member-ready', start); start();
})();
