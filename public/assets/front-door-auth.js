/* Founder Control Room front-door sign-up/sign-in overlay.
   Reuses the same endpoints as /welcome (WELCOME_DOOR_CONTRACT.md v1.1):
   member magic-link = create-or-sign-in for the open "founder account" tier,
   founder magic-link + Google = the separate allowlisted founder sign-in. */
(function () {
  'use strict';

  var overlay = document.getElementById('auth-overlay');
  if (!overlay) return;

  var TIMEOUT_MS = 4000;
  var $ = function (id) { return document.getElementById(id); };

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, ms);
    })]);
  }

  function setStatus(text) { $('auth-status').textContent = text || ''; }

  function openModal(tab) {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    switchTab(tab || 'signup');
    var email = overlay.querySelector('.auth-panel:not([hidden]) input[type="email"]');
    if (email) email.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  function switchTab(name) {
    var tabs = overlay.querySelectorAll('[data-auth-tab]');
    var panels = overlay.querySelectorAll('[data-auth-panel]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-auth-tab') === name;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (var j = 0; j < panels.length; j++) {
      panels[j].hidden = panels[j].getAttribute('data-auth-panel') !== name;
    }
    setStatus('');
  }

  function validEmail(value) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value); }

  function wireMagicLinkForm(formId, emailId, errId, btnId, url, sentCopy) {
    var form = $(formId);
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $(emailId).value.trim();
      var err = $(errId);
      err.hidden = true;
      if (!validEmail(email)) {
        err.textContent = 'Enter a valid email.'; err.hidden = false; $(emailId).focus(); return;
      }
      var btn = $(btnId);
      var originalText = btn.textContent;
      btn.disabled = true; btn.textContent = 'Sending…';
      withTimeout(fetch(url, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email: email }),
      }), TIMEOUT_MS).then(function (r) {
        if (r.status === 202) {
          btn.textContent = 'Check your email'; setStatus(sentCopy); return;
        }
        btn.disabled = false; btn.textContent = originalText;
        if (r.status === 400) { err.textContent = 'Enter a valid email.'; err.hidden = false; return; }
        if (r.status === 429) { err.textContent = 'Too many requests. Wait a few minutes and try again.'; err.hidden = false; return; }
        setStatus('Sign-in service is not reachable right now.');
      }).catch(function () {
        btn.disabled = false; btn.textContent = originalText;
        setStatus('Sign-in service is not reachable right now.');
      });
    });
  }

  wireMagicLinkForm('auth-signup-form', 'auth-signup-email', 'auth-signup-err', 'auth-signup-submit',
    '/auth/member/magic-link', 'If eligible, a sign-in link will arrive in your inbox.');
  wireMagicLinkForm('auth-signin-form', 'auth-signin-email', 'auth-signin-err', 'auth-signin-submit',
    '/auth/member/magic-link', 'If eligible, a sign-in link will arrive in your inbox.');
  wireMagicLinkForm('auth-founder-form', 'auth-founder-email', 'auth-founder-err', 'auth-founder-submit',
    '/auth/magic-link', 'If this email is on the founder allowlist, a secure login link has been sent.');

  var tabButtons = overlay.querySelectorAll('[data-auth-tab]');
  for (var t = 0; t < tabButtons.length; t++) {
    tabButtons[t].addEventListener('click', function (e) { switchTab(e.currentTarget.getAttribute('data-auth-tab')); });
  }
  var switchLinks = overlay.querySelectorAll('[data-auth-switch]');
  for (var s = 0; s < switchLinks.length; s++) {
    switchLinks[s].addEventListener('click', function (e) { switchTab(e.currentTarget.getAttribute('data-auth-switch')); });
  }
  var closers = overlay.querySelectorAll('[data-auth-close]');
  for (var c = 0; c < closers.length; c++) {
    closers[c].addEventListener('click', closeModal);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) closeModal();
  });

  var openers = document.querySelectorAll('[data-auth-open]');
  for (var o = 0; o < openers.length; o++) {
    openers[o].addEventListener('click', function (e) {
      e.preventDefault();
      openModal(e.currentTarget.getAttribute('data-auth-open') || 'signup');
    });
  }
})();
