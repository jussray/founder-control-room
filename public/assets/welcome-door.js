/* Founder Control Room welcome door. External file: CSP is script-src 'self' (public/_headers).
   Contract: WELCOME_DOOR_CONTRACT.md v1.1. Session envelope: {success:true, data:{founder:{email}}}. */
(function () {
  'use strict';
  var body = document.body;
  var cfg = {
    sessionUrl: body.dataset.sessionUrl || '/auth/me',
    magicUrl: body.dataset.magicUrl || '/auth/magic-link',
    enterUrl: body.dataset.enterUrl || '/control-room/',
    enabled: body.dataset.enabled !== 'false',
    timeoutMs: 4000
  };
  var door = document.getElementById('door');
  var $ = function (id) { return document.getElementById(id); };
  var STATUS = {
    checking: 'Checking sign-in service…',
    signed_out: 'Sign-in service: reachable',
    degraded: 'Sign-in service: not reachable',
    sent: 'Sign-in link sent if the address is on the allowlist'
  };

  function setState(state) {
    door.dataset.state = state;
    var sections = door.querySelectorAll('[data-for]');
    for (var i = 0; i < sections.length; i++) {
      sections[i].hidden = sections[i].dataset.for !== state;
    }
    $('statusline').textContent = STATUS[state] || '';
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, ms);
    })]);
  }

  /* Live check. 401/403 = signed out (normal). Any other failure = degraded. Never guess. */
  function resolveState() {
    if (!cfg.enabled) return Promise.resolve({ state: 'degraded' });
    return withTimeout(fetch(cfg.sessionUrl, {
      credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }
    }), cfg.timeoutMs).then(function (r) {
      if (r.status === 401 || r.status === 403) return { state: 'signed_out' };
      if (!r.ok) return { state: 'degraded' };
      return r.json().then(function (j) {
        var founder = j && j.data && j.data.founder;
        return founder ? { state: 'signed_in', email: founder.email } : { state: 'degraded' };
      });
    }).catch(function () { return { state: 'degraded' }; });
  }

  function boot() {
    resolveState().then(function (s) {
      if (s.state === 'signed_in') { location.replace(cfg.enterUrl); return; }
      setState(s.state);
    });
  }

  $('magic').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('email').value.trim();
    var err = $('formerr');
    err.hidden = true;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Enter a valid email.'; err.hidden = false; $('email').focus(); return; }
    var btn = $('primary'); btn.disabled = true; btn.textContent = 'Sending…';
    withTimeout(fetch(cfg.magicUrl, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email: email })
    }), cfg.timeoutMs).then(function (r) {
      if (r.status === 202) { btn.textContent = 'Check your email'; $('statusline').textContent = STATUS.sent; return; }
      btn.disabled = false; btn.textContent = 'Send sign-in link';
      if (r.status === 400) { err.textContent = 'Enter a valid email.'; err.hidden = false; return; }
      if (r.status === 429) { err.textContent = 'Too many requests. Wait a few minutes and try again.'; err.hidden = false; return; }
      setState('degraded');
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Send sign-in link';
      setState('degraded');
    });
  });

  $('retry').addEventListener('click', function () { setState('checking'); boot(); });
  boot();
})();
