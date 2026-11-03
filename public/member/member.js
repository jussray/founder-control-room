(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  async function load() {
    $('loading').hidden = false; $('workspace').hidden = true; $('unavailable').hidden = true;
    try {
      const response = await fetch('/auth/member/me', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      if (response.status === 401 || response.status === 403) {
        location.replace('/welcome'); return;
      }
      if (!response.ok) throw new Error('Member service unavailable');
      const payload = await response.json();
      const member = payload && payload.success === true && payload.data && payload.data.member;
      const workspace = payload && payload.data && payload.data.workspace;
      if (!member || typeof member.email !== 'string' ||
          !workspace || !Array.isArray(workspace.projects) || workspace.projects.length ||
          !Array.isArray(workspace.agents) || workspace.agents.length ||
          !Array.isArray(workspace.activity) || workspace.activity.length) {
        throw new Error('Unexpected member response');
      }
      $('member-email').textContent = member.email;
      $('loading').hidden = true; $('workspace').hidden = false;
    } catch {
      $('loading').hidden = true; $('unavailable').hidden = false;
    }
  }
  $('sign-out').addEventListener('click', async () => {
    const button = $('sign-out'); button.disabled = true;
    $('notice').hidden = true;
    try {
      const response = await fetch('/auth/member/logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) throw new Error('Logout could not be verified');
      location.replace('/welcome');
    } catch {
      button.disabled = false;
      $('notice').textContent = 'Logout did not complete. Your session is still active; please try again.';
      $('notice').hidden = false;
    }
  });
  $('retry').addEventListener('click', load);
  void load();
})();