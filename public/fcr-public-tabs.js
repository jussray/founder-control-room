(function () {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('.switch [role="tab"]'));
  const userPanel = document.querySelector('[data-view-panel="user"]');
  const founderPanel = document.querySelector('[data-view-panel="founder"]');
  const userNav = document.querySelector('[data-user-nav]');
  const founderNav = document.querySelector('[data-founder-nav]');
  if (tabs.length !== 2 || !userPanel || !founderPanel || !userNav || !founderNav) return;

  const founderHashes = new Set(['#founder', '#dashboard', '#projects', '#proof', '#community-f', '#automations']);
  const viewForHash = () => founderHashes.has(window.location.hash.toLowerCase()) ? 'founder' : 'user';

  function show(view, updateHash) {
    const isFounder = view === 'founder';
    userPanel.hidden = isFounder;
    founderPanel.hidden = !isFounder;
    userNav.hidden = isFounder;
    founderNav.hidden = !isFounder;
    for (const tab of tabs) {
      const selected = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    if (updateHash) {
      const target = isFounder ? '#founder' : '#user';
      if (window.location.hash !== target) window.history.replaceState(null, '', target);
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => show(tab.dataset.view, true));
    tab.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      tabs[next].focus();
      show(tabs[next].dataset.view, true);
    });
  });

  window.addEventListener('hashchange', () => show(viewForHash(), false));
  show(viewForHash(), false);
})();
