import { createHash } from 'node:crypto';
import type { PatchFileChange } from '../providers/RepositoryProvider.js';

export const FOUNDER_OS_STAGED_PATCH_VERSION = 'founder-os-virtual-workspace-edit-v1' as const;

export interface FounderOsStagedPatchReceipt {
  version: typeof FOUNDER_OS_STAGED_PATCH_VERSION;
  status: 'staged';
  mode: 'in-memory-only';
  repository: string;
  branch: string;
  sourceSha: string;
  changes: Array<{
    path: string;
    beforeSha256: string;
    afterSha256: string;
  }>;
  providerCalls: false;
  filesystemWrites: false;
  sourceBranchWrites: false;
  externalExecutionAllowed: false;
}

export interface FounderOsStagedPatchContext {
  repository: string;
  branch: string;
  /** Independently reread from the provider, not supplied by the simulator. */
  liveHeadSha: string;
  /** Independently reread from the FCR mission's pinned policy. */
  missionExpectedHeadSha: string;
  changes: readonly PatchFileChange[];
  /** Original files independently read from the current mission branch. */
  sourceFiles: readonly { path: string; content: string }[];
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 16 * 1024;
const REPO = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function safeWorkspacePath(path: unknown): path is string {
  if (typeof path !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(path)) return false;
  const segments = path.split('/');
  return segments.length > 1 && ['src', 'docs', 'test', 'tests', 'labs'].includes(segments[0]!)
    && segments.every((part) => part.length > 0 && part !== '.' && part !== '..'
      && !/^(?:\.git|\.env(?:\..*)?|node_modules|secrets?|credentials?|\.npmrc)$/i.test(part))
    && !/\.(?:pem|p12|pfx|key|enc|db|sqlite)$/i.test(path);
}

/**
 * Proof-only adapter for the *existing* authenticated mission patch route.
 * Does not authorize a write, trust the simulator's self-described success,
 * or access the repository. Every original snapshot comes from the provider.
 */
export function validateFounderOsStagedPatch(
  candidate: unknown,
  context: FounderOsStagedPatchContext,
): string[] {
  const failures: string[] = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return ['staged workspace receipt must be an object'];
  }
  const receipt = candidate as Partial<FounderOsStagedPatchReceipt>;
  if (receipt.version !== FOUNDER_OS_STAGED_PATCH_VERSION
    || receipt.status !== 'staged' || receipt.mode !== 'in-memory-only'
    || receipt.providerCalls !== false || receipt.filesystemWrites !== false
    || receipt.sourceBranchWrites !== false || receipt.externalExecutionAllowed !== false) {
    failures.push('staged workspace receipt contract or isolation boundary is invalid');
  }

  if (!REPO.test(context.repository) || receipt.repository !== context.repository) {
    failures.push('staged workspace repository does not match the registered project');
  }
  if (receipt.branch !== context.branch
    || !context.branch || ['main', 'master'].includes(context.branch)
    || context.branch.startsWith('refs/heads/main')) {
    failures.push('staged workspace branch must match an isolated mission branch');
  }
  if (!FULL_SHA.test(context.liveHeadSha)
    || !FULL_SHA.test(context.missionExpectedHeadSha)
    || !FULL_SHA.test(receipt.sourceSha ?? '')
    || context.liveHeadSha.toLowerCase() !== context.missionExpectedHeadSha.toLowerCase()
    || receipt.sourceSha?.toLowerCase() !== context.liveHeadSha.toLowerCase()) {
    failures.push('staged workspace exact head is stale or does not match the mission pin');
  }

  if (!Array.isArray(receipt.changes)
    || receipt.changes.length < 1 || receipt.changes.length > MAX_FILES
    || receipt.changes.length !== context.changes.length
    || receipt.changes.length !== context.sourceFiles.length) {
    return [...failures, 'staged workspace must contain one to three exact changed file snapshots'];
  }

  const paths = new Set<string>();
  for (let index = 0; index < receipt.changes.length; index += 1) {
    const entry = receipt.changes[index];
    const change = context.changes[index];
    const before = context.sourceFiles[index];
    if (!entry || !change || !before || !safeWorkspacePath(entry.path)
      || entry.path !== change.path || entry.path !== before.path || paths.has(entry.path)) {
      failures.push('staged workspace changed files are unsafe, duplicated, or out of order');
      continue;
    }
    paths.add(entry.path);
    if (change.delete === true || typeof change.content !== 'string'
      || typeof before.content !== 'string'
      || Buffer.byteLength(change.content, 'utf8') > MAX_FILE_BYTES
      || Buffer.byteLength(before.content, 'utf8') > MAX_FILE_BYTES) {
      failures.push('staged workspace only accepts bounded non-destructive text edits');
      continue;
    }
    if (!HASH.test(entry.beforeSha256 ?? '') || !HASH.test(entry.afterSha256 ?? '')
      || entry.beforeSha256 !== hash(before.content)
      || entry.afterSha256 !== hash(change.content)
      || entry.beforeSha256 === entry.afterSha256) {
      failures.push('staged workspace source or edited content fingerprint does not match provider evidence');
    }
  }
  return [...new Set(failures)];
}
