(() => {
  'use strict';

  const API_BASE = '/automation/conveyor/founder-content/lifecycle';
  const APPROVAL_ROUTE = '/automation/conveyor/founder-content/approvals';
  const liveRuntime = location.protocol === 'https:' || location.protocol === 'http:';

  const root = document.querySelector('[data-lifecycle-control-plane]');
  if (!root) return;

  const state = {
    posts: [],
    selectedId: null,
    capabilities: null,
    analytics: null,
  };

  const runtimePill = root.querySelector('[data-lifecycle-runtime]');
  const adapterNote = root.querySelector('[data-adapter-note]');
  const postList = root.querySelector('[data-post-list]');
  const output = root.querySelector('[data-console-output]');
  const selectedConsole = root.querySelector('[data-selected-console]');
  const selectedTitle = root.querySelector('[data-selected-title]');
  const selectedStatus = root.querySelector('[data-selected-status]');
  const selectedProvider = root.querySelector('[data-selected-provider]');
  const selectedHash = root.querySelector('[data-selected-hash]');
  const selectedWriteState = root.querySelector('[data-selected-write-state]');
  const analyticsNodes = {
    total: root.querySelector('[data-metric-total]'),
    posted: root.querySelector('[data-metric-posted]'),
    scheduled: root.querySelector('[data-metric-scheduled]'),
    failures: root.querySelector('[data-metric-failures]'),
  };

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function parseJsonField(selector, label) {
    const raw = text(root.querySelector(selector)?.value);
    if (!raw) throw new Error(`${label} is required`);
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
      return parsed;
    } catch {
      throw new Error(`${label} must be valid JSON object text`);
    }
  }

  function toIsoFromLocal(value, label) {
    const raw = text(value);
    const ms = Date.parse(raw);
    if (!raw || !Number.isFinite(ms)) throw new Error(`${label} must be a valid date and time`);
    return new Date(ms).toISOString();
  }

  function setOutput(value, tone = 'neutral') {
    if (!output) return;
    output.dataset.tone = tone;
    output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  function setRuntime(stateName, label) {
    if (!runtimePill) return;
    runtimePill.dataset.state = stateName;
    runtimePill.textContent = label;
  }

  function errorMessage(error) {
    if (error && typeof error === 'object') {
      if (error.payload && typeof error.payload === 'object') {
        return error.payload.reason || error.payload.code || error.message || 'Lifecycle operation failed';
      }
      if (typeof error.message === 'string') return error.message;
    }
    return 'Lifecycle operation failed';
  }

  async function request(path, options = {}) {
    if (!liveRuntime) {
      const error = new Error('Static proof mode: open this page through the authenticated FCR runtime to use lifecycle actions.');
      error.code = 'PREVIEW_ONLY';
      throw error;
    }
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      ...options,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = { ok: false, code: 'NON_JSON_RESPONSE' };
    }
    if (!response.ok) {
      const error = new Error(payload?.reason || payload?.code || `HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function approvalRequest(body) {
    if (!liveRuntime) throw new Error('Static proof mode: approval issuance requires authenticated FCR runtime.');
    const response = await fetch(APPROVAL_ROUTE, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = { ok: false, code: 'NON_JSON_RESPONSE' }; }
    if (!response.ok) {
      const error = new Error(payload?.reasons?.[0] || payload?.code || `HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function selectedPost() {
    return state.posts.find((post) => post.postId === state.selectedId) || null;
  }

  function postCopy(post) {
    const payload = post?.publicPayload || {};
    if (typeof payload.draft_text === 'string') return payload.draft_text;
    if (typeof payload.text === 'string') return payload.text;
    return JSON.stringify(payload);
  }

  function renderAdapters() {
    if (!adapterNote) return;
    const adapters = state.capabilities?.providerAdapters || [];
    if (!liveRuntime) {
      adapterNote.textContent = 'Static proof mode. Runtime reads and all mutations are disabled; provider truth remains UNKNOWN.';
      return;
    }
    if (!adapters.length) {
      adapterNote.textContent = 'No provider lifecycle adapters are registered in this runtime. Account connect/list, status readback, and metric sync will fail closed until an adapter is activated.';
      return;
    }
    adapterNote.textContent = `Runtime adapters: ${adapters.map((item) => `${item.provider} (${item.supportedPlatforms.join(', ')})`).join(' · ')}`;
  }

  function renderAnalytics() {
    const analytics = state.analytics || {};
    if (analyticsNodes.total) analyticsNodes.total.textContent = String(analytics.totalPosts ?? 0);
    if (analyticsNodes.posted) analyticsNodes.posted.textContent = String(analytics.byStatus?.posted ?? 0);
    if (analyticsNodes.scheduled) analyticsNodes.scheduled.textContent = String(analytics.byStatus?.scheduled ?? 0);
    if (analyticsNodes.failures) analyticsNodes.failures.textContent = String(analytics.failureCount ?? 0);
  }

  function makeButton(label, action, tone = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `control-button ${tone}`.trim();
    button.textContent = label;
    button.dataset.postAction = action;
    if (!liveRuntime) button.disabled = true;
    return button;
  }

  function renderPosts() {
    if (!postList) return;
    postList.replaceChildren();
    if (!state.posts.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = liveRuntime
        ? 'No lifecycle posts yet. Create a draft to begin.'
        : 'Static proof mode. Runtime posts load only through authenticated FCR.';
      postList.append(empty);
      renderSelected();
      return;
    }

    for (const post of state.posts) {
      const card = document.createElement('article');
      card.className = 'post-card';
      card.dataset.postId = post.postId;
      card.dataset.selected = String(post.postId === state.selectedId);

      const head = document.createElement('div');
      head.className = 'post-card-head';
      const heading = document.createElement('div');
      const title = document.createElement('h4');
      title.textContent = post.title || `${post.platform} draft`;
      const id = document.createElement('p');
      id.className = 'field-note';
      id.textContent = post.postId;
      heading.append(title, id);

      const bulk = document.createElement('label');
      bulk.className = 'inline-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.bulkSelect = post.postId;
      const bulkText = document.createElement('span');
      bulkText.textContent = 'Bulk schedule';
      bulk.append(checkbox, bulkText);
      head.append(heading, bulk);

      const meta = document.createElement('div');
      meta.className = 'post-meta';
      for (const value of [post.status, `${post.provider}/${post.platform}`, post.providerWriteState]) {
        const pill = document.createElement('span');
        pill.className = 'mini-pill';
        pill.textContent = value;
        meta.append(pill);
      }

      const copy = document.createElement('p');
      copy.className = 'post-copy';
      copy.textContent = postCopy(post).slice(0, 320);

      const actions = document.createElement('div');
      actions.className = 'post-actions';
      actions.append(makeButton(post.postId === state.selectedId ? 'Selected' : 'Open', 'select', 'primary'));
      actions.append(makeButton('Logs', 'logs'));
      actions.append(makeButton('Status', 'status'));

      card.append(head, meta, copy, actions);
      postList.append(card);
    }
    renderSelected();
  }

  function renderSelected() {
    const post = selectedPost();
    if (!selectedConsole) return;
    selectedConsole.hidden = !post;
    if (!post) return;
    if (selectedTitle) selectedTitle.textContent = post.title || `${post.platform} draft`;
    if (selectedStatus) selectedStatus.textContent = post.status;
    if (selectedProvider) selectedProvider.textContent = `${post.provider}/${post.platform}`;
    if (selectedHash) selectedHash.textContent = post.contentHash;
    if (selectedWriteState) selectedWriteState.textContent = post.providerWriteState;

    const approvalId = root.querySelector('[data-approval-id]');
    if (approvalId && post.approvalId && !text(approvalId.value)) approvalId.value = post.approvalId;
    const publicHash = root.querySelector('[data-public-payload-hash]');
    if (publicHash) publicHash.value = post.contentHash;

    root.querySelectorAll('[data-selected-action]').forEach((button) => {
      if (!liveRuntime) {
        button.disabled = true;
        return;
      }
      const action = button.dataset.selectedAction;
      if (action === 'retry') button.disabled = post.status !== 'failed';
      else if (action === 'publish') button.disabled = !['approved', 'scheduled'].includes(post.status);
      else button.disabled = false;
    });
  }

  async function loadCapabilities() {
    state.capabilities = await request('/');
    renderAdapters();
  }

  async function loadPosts() {
    const payload = await request('/posts?limit=100');
    state.posts = Array.isArray(payload.posts) ? payload.posts : [];
    if (state.selectedId && !state.posts.some((post) => post.postId === state.selectedId)) state.selectedId = null;
    renderPosts();
  }

  async function loadAnalytics() {
    state.analytics = await request('/analytics?limit=200');
    renderAnalytics();
  }

  async function refreshAll() {
    if (!liveRuntime) {
      setRuntime('preview', 'Static proof mode');
      renderAdapters();
      renderAnalytics();
      renderPosts();
      return;
    }
    setRuntime('blocked', 'Checking FCR runtime…');
    try {
      await Promise.all([loadCapabilities(), loadPosts(), loadAnalytics()]);
      setRuntime('ready', 'Authenticated lifecycle ready');
      setOutput('Lifecycle readback complete. No provider mutation was performed.', 'good');
    } catch (error) {
      setRuntime('blocked', error?.status === 401 ? 'Founder sign-in required' : 'Lifecycle runtime blocked');
      setOutput(errorMessage(error), 'error');
    }
  }

  async function runOperation(task, successMessage) {
    try {
      const result = await task();
      setOutput(result, 'good');
      if (successMessage) setRuntime('ready', successMessage);
      await Promise.allSettled([loadPosts(), loadAnalytics()]);
      return result;
    } catch (error) {
      setOutput(error.payload || errorMessage(error), 'error');
      throw error;
    }
  }

  root.querySelector('[data-refresh-lifecycle]')?.addEventListener('click', () => refreshAll());

  root.querySelector('[data-create-draft-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const draftText = text(data.get('draft_text'));
    if (!draftText) return setOutput('Draft text is required.', 'error');
    try {
      const result = await runOperation(() => request('/posts', {
        method: 'POST',
        body: {
          provider: text(data.get('provider')).toLowerCase(),
          platform: text(data.get('platform')).toLowerCase(),
          account_id: text(data.get('account_id')),
          title: text(data.get('title')),
          public_payload: { draft_text: draftText },
          media_count: 0,
        },
      }), 'Draft stored');
      if (result?.post?.postId) state.selectedId = result.post.postId;
      await loadPosts();
    } catch {}
  });

  root.querySelector('[data-account-list]')?.addEventListener('click', async () => {
    const provider = text(root.querySelector('[data-account-provider]')?.value).toLowerCase();
    const platform = text(root.querySelector('[data-account-platform]')?.value).toLowerCase();
    try { await runOperation(() => request(`/accounts?provider=${encodeURIComponent(provider)}&platform=${encodeURIComponent(platform)}`)); } catch {}
  });

  root.querySelector('[data-account-connect]')?.addEventListener('click', async () => {
    const provider = text(root.querySelector('[data-account-provider]')?.value).toLowerCase();
    const platform = text(root.querySelector('[data-account-platform]')?.value).toLowerCase();
    const accountName = text(root.querySelector('[data-account-name]')?.value);
    try {
      await runOperation(() => request('/accounts/connect', {
        method: 'POST',
        body: { provider, platform, account_name: accountName },
      }));
    } catch {}
  });

  root.querySelector('[data-bulk-schedule]')?.addEventListener('click', async () => {
    const postIds = [...root.querySelectorAll('[data-bulk-select]:checked')].map((node) => node.dataset.bulkSelect);
    if (!postIds.length) return setOutput('Select at least one post for bulk schedule intent.', 'error');
    try {
      const startAt = toIsoFromLocal(root.querySelector('[data-bulk-start]')?.value, 'Bulk schedule start');
      const intervalMinutes = Number(root.querySelector('[data-bulk-interval]')?.value || 30);
      await runOperation(() => request('/posts/bulk-schedule', {
        method: 'POST',
        body: { post_ids: postIds, start_at: startAt, interval_minutes: intervalMinutes },
      }), 'Editorial schedule intent stored');
    } catch (error) {
      if (!error?.payload) setOutput(errorMessage(error), 'error');
    }
  });

  postList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-post-action]');
    if (!button) return;
    const card = button.closest('[data-post-id]');
    const postId = card?.dataset.postId;
    if (!postId) return;
    const action = button.dataset.postAction;
    if (action === 'select') {
      state.selectedId = postId;
      renderPosts();
      selectedConsole?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    try {
      if (action === 'logs') await runOperation(() => request(`/posts/${postId}/logs`));
      if (action === 'status') await runOperation(() => request(`/posts/${postId}/status`));
    } catch {}
  });

  root.querySelector('[data-add-comment]')?.addEventListener('click', async () => {
    const post = selectedPost();
    const message = text(root.querySelector('[data-review-comment]')?.value);
    if (!post || !message) return setOutput('Select a post and enter a review comment.', 'error');
    try {
      await runOperation(() => request(`/posts/${post.postId}/comments`, { method: 'POST', body: { message } }), 'Review comment recorded');
      root.querySelector('[data-review-comment]').value = '';
    } catch {}
  });

  root.querySelector('[data-selected-action="comments"]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    try { await runOperation(() => request(`/posts/${post.postId}/comments`)); } catch {}
  });

  root.querySelector('[data-selected-action="logs"]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    try { await runOperation(() => request(`/posts/${post.postId}/logs`)); } catch {}
  });

  root.querySelector('[data-selected-action="status"]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    try { await runOperation(() => request(`/posts/${post.postId}/status`)); } catch {}
  });

  root.querySelector('[data-selected-action="metrics"]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    try { await runOperation(() => request(`/posts/${post.postId}/sync-metrics`, { method: 'POST', body: {} })); } catch {}
  });

  root.querySelector('[data-selected-action="reschedule"]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    try {
      const scheduledAt = toIsoFromLocal(root.querySelector('[data-reschedule-at]')?.value, 'Schedule time');
      await runOperation(() => request(`/posts/${post.postId}/reschedule`, {
        method: 'POST', body: { scheduled_at: scheduledAt },
      }), 'Editorial schedule intent stored');
    } catch (error) {
      if (!error?.payload) setOutput(errorMessage(error), 'error');
    }
  });

  root.querySelector('[data-selected-action="reject"]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    const reason = text(root.querySelector('[data-reject-reason]')?.value);
    if (!reason) return setOutput('A rejection reason is required.', 'error');
    try { await runOperation(() => request(`/posts/${post.postId}/reject`, { method: 'POST', body: { reason } }), 'Post rejected'); } catch {}
  });

  root.querySelector('[data-selected-action="retry"]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    try { await runOperation(() => request(`/posts/${post.postId}/retry`, { method: 'POST', body: {} }), 'Retry reset stored; fresh approval required'); } catch {}
  });

  root.querySelector('[data-issue-approval]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    try {
      const proposal = parseJsonField('[data-proposal-json]', 'Proposal');
      const result = await approvalRequest({ proposal, confirm_exact_copy: true });
      root.querySelector('[data-approval-id]').value = text(result.approval_id);
      root.querySelector('[data-authorization-hash]').value = text(result.authorization_hash);
      root.querySelector('[data-public-payload-hash]').value = text(result.public_payload_hash);
      setOutput(result, 'good');
      setRuntime('ready', 'Exact-copy approval issued');
    } catch (error) {
      setOutput(error.payload || errorMessage(error), 'error');
    }
  });

  root.querySelector('[data-bind-approval]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    try {
      const proposal = parseJsonField('[data-proposal-json]', 'Proposal');
      const approvalId = text(root.querySelector('[data-approval-id]')?.value);
      const authorizationHash = text(root.querySelector('[data-authorization-hash]')?.value);
      if (!approvalId || !authorizationHash) throw new Error('Issue or enter the exact approval receipt first.');
      await runOperation(() => request(`/posts/${post.postId}/approve`, {
        method: 'POST',
        body: { proposal, approval_id: approvalId, authorization_hash: authorizationHash },
      }), 'Approval bound to exact draft');
    } catch (error) {
      if (!error?.payload) setOutput(errorMessage(error), 'error');
    }
  });

  root.querySelector('[data-selected-action="publish"]')?.addEventListener('click', async () => {
    const post = selectedPost(); if (!post) return;
    const confirm = root.querySelector('[data-publish-confirm]');
    if (!confirm?.checked) return setOutput('Explicit publish confirmation is required.', 'error');
    try {
      const proposal = parseJsonField('[data-proposal-json]', 'Proposal');
      const approvalId = text(root.querySelector('[data-approval-id]')?.value);
      const authorizationHash = text(root.querySelector('[data-authorization-hash]')?.value);
      const publicPayloadHash = text(root.querySelector('[data-public-payload-hash]')?.value);
      if (!approvalId || !authorizationHash || !publicPayloadHash) throw new Error('Exact approval receipt fields are required.');
      const result = await runOperation(() => request(`/posts/${post.postId}/publish-now`, {
        method: 'POST',
        body: {
          proposal,
          approval_id: approvalId,
          confirmation: {
            confirm_publication: true,
            authorization_hash: authorizationHash,
            public_payload_hash: publicPayloadHash,
          },
        },
      }));
      confirm.checked = false;
      if (result?.published === true && result?.lifecycleSync === 'failed') {
        setOutput({ ...result, warning: 'Provider publication is proven. Lifecycle sync failed. DO NOT RETRY publication.' }, 'error');
      }
    } catch (error) {
      if (!error?.payload) setOutput(errorMessage(error), 'error');
    }
  });

  if (!liveRuntime) {
    root.querySelectorAll('[data-live-only]').forEach((node) => { node.disabled = true; });
    setRuntime('preview', 'Static proof mode');
  }

  refreshAll();
})();
