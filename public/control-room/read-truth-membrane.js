(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const projectTruth = {
    state: 'idle',
    httpStatus: null,
  };

  function setProjectTruth(state, httpStatus = null) {
    projectTruth.state = state;
    projectTruth.httpStatus = httpStatus;
    queueMicrotask(applyProjectTruth);
  }

  function applyProjectTruth() {
    const list = document.querySelector('#project-list');
    if (!list) return;

    if (projectTruth.state === 'idle' || projectTruth.state === 'loading') {
      if (list.querySelector('.card') || list.querySelector('[data-read-truth="projects-loading"]')) return;
      list.innerHTML = '<p class="muted" data-read-truth="projects-loading" role="status" aria-live="polite">Loading current project truth…</p>';
      return;
    }

    if (projectTruth.state === 'error') {
      const status = Number.isInteger(projectTruth.httpStatus)
        ? ` (HTTP ${projectTruth.httpStatus})`
        : '';
      const existing = list.querySelector('[data-read-truth="projects-unknown"]');
      if (existing && existing.textContent?.includes(`authoritative read failed${status}`)) return;
      list.innerHTML = `
        <p class="error" data-read-truth="projects-unknown" role="alert">
          Projects unavailable. Current project registration state is UNKNOWN because the authoritative read failed${status}.
        </p>
      `;
    }
  }

  const observer = new MutationObserver(applyProjectTruth);

  function observeRoot() {
    const root = document.getElementById('root');
    if (!root) return;
    observer.observe(root, { childList: true, subtree: true });
    applyProjectTruth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeRoot, { once: true });
  } else {
    observeRoot();
  }

  window.fetch = async function truthAwareFetch(input, init = {}) {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(requestUrl, window.location.origin);
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const tracksProjects = method === 'GET'
      && url.origin === window.location.origin
      && url.pathname === '/projects';

    if (tracksProjects) setProjectTruth('loading');

    try {
      const response = await nativeFetch(input, init);
      if (tracksProjects) {
        setProjectTruth(response.ok ? 'ready' : 'error', response.status);
      }
      return response;
    } catch (error) {
      if (tracksProjects) setProjectTruth('error');
      throw error;
    }
  };

  window.__FCR_READ_TRUTH__ = Object.freeze({
    projects: () => Object.freeze({ ...projectTruth }),
  });
})();
