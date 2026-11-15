import { createHash } from 'node:crypto';

// In-memory stage only: no filesystem, network, repository, or provider mutations.
export const VIRTUAL_WORKSPACE_EDIT_VERSION = 'founder-os-virtual-workspace-edit-v1';
const SHA40 = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const ROOTS = new Set(['src', 'docs', 'test', 'tests', 'labs']);
const MAX_BYTES = 16 * 1024;

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(label + ' is required');
  return value.trim();
}
function safePath(path) {
  if (typeof path !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(path)) return false;
  const parts = path.split('/');
  return parts.length > 1 && ROOTS.has(parts[0])
    && parts.every((p) => p && p !== '.' && p !== '..'
      && !/^(?:\.git|\.env(?:\..*)?|node_modules|secrets?|credentials?|\.npmrc)$/i.test(p))
    && !/\.(?:pem|p12|pfx|key|enc|db|sqlite)$/i.test(path);
}
function bounded(value, label) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_BYTES) {
    throw new TypeError(label + ' must be UTF-8 text at most 16384 bytes');
  }
  return value;
}
function hash(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** An atomic virtual edit against exact supplied snapshots, never a live write. */
export function stageVirtualWorkspaceEdit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('workspace input must be an object');
  }
  if (input.dataClassification !== 'synthetic') {
    throw new TypeError('only synthetic snapshots are accepted');
  }
  const repository = required(input.repository, 'repository');
  const sourceSha = required(input.sourceSha, 'sourceSha').toLowerCase();
  const branch = required(input.branch, 'branch');
  if (!REPOSITORY.test(repository) || !SHA40.test(sourceSha)) {
    throw new TypeError('an exact repository and 40-character source SHA are required');
  }
  if (branch === 'main' || branch === 'master'
    || branch.startsWith('refs/heads/main')
    || !/^[a-zA-Z0-9_.\/-]+$/.test(branch)) {
    throw new TypeError('a non-default candidate branch is required');
  }
  if (!Array.isArray(input.files) || !Array.isArray(input.edits)
    || input.files.length < 1 || input.files.length > 3
    || input.edits.length < 1 || input.edits.length > 3) {
    throw new TypeError('workspace requires 1 to 3 source snapshots and exact edits');
  }

  const originals = new Map();
  let totalBytes = 0;
  for (const file of input.files) {
    if (!file || !safePath(file.path) || originals.has(file.path)) {
      throw new TypeError('source snapshot path is unsafe or duplicated');
    }
    const content = bounded(file.content, 'source content');
    totalBytes += Buffer.byteLength(content, 'utf8');
    originals.set(file.path, content);
  }
  if (totalBytes > 32 * 1024) throw new TypeError('source snapshot budget exceeded');

  const touched = new Set();
  const artifacts = [];
  const changes = [];
  for (const edit of input.edits) {
    if (!edit || !safePath(edit.path) || touched.has(edit.path) || !originals.has(edit.path)) {
      throw new TypeError('edit path must be unique and reference an allowed source snapshot');
    }
    const before = originals.get(edit.path);
    const find = required(edit.find, 'edit.find');
    const replacement = bounded(edit.replace, 'edit.replace');
    if (find === replacement || !before.includes(find)
      || before.indexOf(find) !== before.lastIndexOf(find)) {
      throw new TypeError('edit requires exactly one current exact-text match and a non-noop replacement');
    }
    const after = bounded(before.replace(find, replacement), 'updated content');
    const beforeSha256 = hash(before);
    const afterSha256 = hash(after);
    touched.add(edit.path);
    artifacts.push(Object.freeze({ path: edit.path, content: after, expectedBeforeSha256: beforeSha256 }));
    changes.push(Object.freeze({ path: edit.path, beforeSha256, afterSha256 }));
  }
  return Object.freeze({
    receipt: Object.freeze({
      version: VIRTUAL_WORKSPACE_EDIT_VERSION,
      status: 'staged',
      mode: 'in-memory-only',
      repository, sourceSha, branch,
      changes: Object.freeze(changes),
      providerCalls: false,
      filesystemWrites: false,
      sourceBranchWrites: false,
      externalExecutionAllowed: false,
      nextGate: 'Reread exact live branch and file content; apply artifacts only through a separately authorized governed branch writer. Merge and deploy require separate proof.',
    }),
    // Private source artifacts are NEVER part of the sanitized receipt.
    artifacts: Object.freeze(artifacts),
  });
}
