export const FOUNDER_LOCAL_FIRST_VERSION = 1;
export const FOUNDER_LOCAL_FIRST_OUTBOX_KEY = 'fcr_founder_local_first_outbox_v1';

const SCREEN_KEY = 'fcr_founder_screen';
const VIEW_KEY = 'fcr_founder_view';
const CONTEXT_KEY = 'fcr_founder_context';
const ALLOWED_KEYS = Object.freeze([SCREEN_KEY, VIEW_KEY, CONTEXT_KEY]);
const ALLOWED_SCREENS = new Set(['home', 'control', 'chief', 'promptos', 'proof']);
const ALLOWED_VIEWS = new Set(['overview', 'work', 'costs', 'execution']);
const MAX_OUTBOX_ITEMS = 32;
const MAX_CONTEXT_VALUE_LENGTH = 240;

function safeGet(storage, key) {
  try { return storage?.getItem?.(key) ?? null; } catch { return null; }
}

function safeSet(storage, key, value) {
  try { storage?.setItem?.(key, value); return true; } catch { return false; }
}

function safeRemove(storage, key) {
  try { storage?.removeItem?.(key); return true; } catch { return false; }
}

function cleanText(value) {
  return typeof value === 'string' && value.length <= MAX_CONTEXT_VALUE_LENGTH ? value : null;
}

function sanitizeContext(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const next = {};
    for (const key of ['projectSlug', 'projectName', 'missionId', 'missionTitle']) {
      const cleaned = cleanText(value[key]);
      if (cleaned) next[key] = cleaned;
    }
    return JSON.stringify(next);
  } catch {
    return null;
  }
}

function sanitizeValue(key, raw) {
  if (raw == null) return null;
  if (key === SCREEN_KEY) return ALLOWED_SCREENS.has(raw) ? raw : null;
  if (key === VIEW_KEY) return ALLOWED_VIEWS.has(raw) ? raw : null;
  if (key === CONTEXT_KEY) return sanitizeContext(raw);
  return null;
}

function parseOutbox(storage) {
  try {
    const parsed = JSON.parse(safeGet(storage, FOUNDER_LOCAL_FIRST_OUTBOX_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => (
      entry
      && typeof entry === 'object'
      && entry.version === FOUNDER_LOCAL_FIRST_VERSION
      && typeof entry.id === 'string'
      && ALLOWED_KEYS.includes(entry.key)
    ));
  } catch {
    return [];
  }
}

function mutationId() {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* use bounded fallback */ }
  return `fcr-local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function payloadFor(key, serialized) {
  if (serialized == null) return null;
  if (key !== CONTEXT_KEY) return serialized;
  try { return JSON.parse(serialized); } catch { return null; }
}

function queueMutation(storage, key, serialized) {
  const previous = parseOutbox(storage)
    .filter((entry) => entry.key !== key)
    .slice(-(MAX_OUTBOX_ITEMS - 1));
  const mutation = {
    version: FOUNDER_LOCAL_FIRST_VERSION,
    id: mutationId(),
    key,
    scope: 'founder-workspace',
    operation: serialized == null ? 'remove' : 'replace',
    payload: payloadFor(key, serialized),
    createdAt: Date.now(),
  };
  return safeSet(storage, FOUNDER_LOCAL_FIRST_OUTBOX_KEY, JSON.stringify([...previous, mutation]));
}

export function readFounderLocalFirstOutbox(storage = globalThis.localStorage) {
  return parseOutbox(storage);
}

export function restoreFounderLocalState({
  durableStorage = globalThis.localStorage,
  sessionStorage = globalThis.sessionStorage,
} = {}) {
  const restored = [];
  for (const key of ALLOWED_KEYS) {
    if (safeGet(sessionStorage, key) != null) continue;
    const durable = sanitizeValue(key, safeGet(durableStorage, key));
    if (durable == null) continue;
    if (safeSet(sessionStorage, key, durable)) restored.push(key);
  }
  return restored;
}

export function snapshotFounderLocalState({
  durableStorage = globalThis.localStorage,
  sessionStorage = globalThis.sessionStorage,
} = {}) {
  const committed = [];
  for (const key of ALLOWED_KEYS) {
    const next = sanitizeValue(key, safeGet(sessionStorage, key));
    const current = sanitizeValue(key, safeGet(durableStorage, key));
    if (next === current) continue;

    const localCommitted = next == null
      ? safeRemove(durableStorage, key)
      : safeSet(durableStorage, key, next);
    if (!localCommitted) continue;

    queueMutation(durableStorage, key, next);
    committed.push(key);
  }
  return committed;
}

export function installFounderLocalFirstState() {
  restoreFounderLocalState();

  let snapshotQueued = false;
  const scheduleSnapshot = () => {
    if (snapshotQueued) return;
    snapshotQueued = true;
    queueMicrotask(() => {
      snapshotQueued = false;
      snapshotFounderLocalState();
    });
  };

  // The five-screen shell changes founder state through user navigation clicks.
  // Queue the durable write after the event so its existing session write lands
  // first, then mirror only the explicit non-sensitive allowlist above.
  document.addEventListener('click', scheduleSnapshot, true);
  window.addEventListener('popstate', scheduleSnapshot);
  window.addEventListener('pagehide', () => snapshotFounderLocalState());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') snapshotFounderLocalState();
  });

  return Object.freeze({
    version: FOUNDER_LOCAL_FIRST_VERSION,
    keys: [...ALLOWED_KEYS],
    outboxKey: FOUNDER_LOCAL_FIRST_OUTBOX_KEY,
  });
}
