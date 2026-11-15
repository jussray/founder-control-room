import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  FOUNDER_OS_STAGED_PATCH_VERSION,
  isSafeFounderOsStagedPatchPath,
  validateFounderOsStagedPatch,
} from '../missionPatchHandoff.js';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const before = 'export const ready = false;\n';
const after = 'export const ready = true;\n';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function fixture() {
  return {
    receipt: {
      version: FOUNDER_OS_STAGED_PATCH_VERSION,
      status: 'staged',
      mode: 'in-memory-only',
      repository: 'jussray/founder-control-room',
      branch: 'mission/example',
      sourceSha: SHA,
      changes: [{
        path: 'src/example.ts',
        beforeSha256: hash(before),
        afterSha256: hash(after),
      }],
      providerCalls: false,
      filesystemWrites: false,
      sourceBranchWrites: false,
      externalExecutionAllowed: false,
    },
    context: {
      repository: 'jussray/founder-control-room',
      branch: 'mission/example',
      liveHeadSha: SHA,
      missionExpectedHeadSha: SHA,
      changes: [{ path: 'src/example.ts', content: after }],
      sourceFiles: [{ path: 'src/example.ts', content: before }],
    },
  };
}

describe('Founder OS staged workspace handoff to existing FCR mission route', () => {
  it('validates only an exact provider reread and does not grant execution', () => {
    const { receipt, context } = fixture();
    expect(validateFounderOsStagedPatch(receipt, context)).toEqual([]);
    expect(receipt.externalExecutionAllowed).toBe(false);
  });

  it('fails closed when the remote mission branch or policy pin moves', () => {
    const { receipt, context } = fixture();
    expect(validateFounderOsStagedPatch(receipt, { ...context, liveHeadSha: OTHER_SHA }))
      .toContain('staged workspace exact head is stale or does not match the mission pin');
    expect(validateFounderOsStagedPatch(receipt, { ...context, missionExpectedHeadSha: OTHER_SHA }))
      .toContain('staged workspace exact head is stale or does not match the mission pin');
  });

  it('rejects a forged source SHA, repository, or target branch', () => {
    const { receipt, context } = fixture();
    expect(validateFounderOsStagedPatch({ ...receipt, sourceSha: 123 }, context))
      .toContain('staged workspace exact head is stale or does not match the mission pin');
    expect(validateFounderOsStagedPatch({ ...receipt, repository: 'other/repo' }, context))
      .toContain('staged workspace repository does not match the registered project');
    expect(validateFounderOsStagedPatch({ ...receipt, branch: 'main' }, context))
      .toContain('staged workspace branch must match an isolated mission branch');
    expect(validateFounderOsStagedPatch(receipt, { ...context, branch: 'main' }))
      .toContain('staged workspace branch must match an isolated mission branch');
  });

  it('rejects forged source and output fingerprints from simulated content', () => {
    const { receipt, context } = fixture();
    const altered = { ...context, sourceFiles: [{ path: 'src/example.ts', content: 'different' }] };
    expect(validateFounderOsStagedPatch(receipt, altered))
      .toContain('staged workspace source or edited content fingerprint does not match provider evidence');
    const forged = { ...context, changes: [{ path: 'src/example.ts', content: 'unexpected' }] };
    expect(validateFounderOsStagedPatch(receipt, forged))
      .toContain('staged workspace source or edited content fingerprint does not match provider evidence');
  });

  it('rejects write authority and side effects claimed inside a receipt', () => {
    const { receipt, context } = fixture();
    for (const altered of [
      { ...receipt, externalExecutionAllowed: true },
      { ...receipt, providerCalls: true },
      { ...receipt, filesystemWrites: true },
      { ...receipt, status: 'committed' },
    ]) {
      expect(validateFounderOsStagedPatch(altered, context))
        .toContain('staged workspace receipt contract or isolation boundary is invalid');
    }
  });

  it('refuses destructive edits, duplicate paths, and unscoped credentials', () => {
    const { receipt, context } = fixture();
    const removed = { ...context, changes: [{ path: 'src/example.ts', delete: true }] };
    expect(validateFounderOsStagedPatch(receipt, removed))
      .toContain('staged workspace only accepts bounded non-destructive text edits');
    for (const path of ['.env', 'src/.env.local', 'src/../secret.ts', 'src/token.pem', '/src/x.ts', '.github/workflows/ci.yml']) {
      expect(isSafeFounderOsStagedPatchPath(path)).toBe(false);
    }
    const repeated = { ...receipt, changes: [receipt.changes[0], receipt.changes[0]] };
    const repeatedContext = {
      ...context,
      changes: [context.changes[0], context.changes[0]],
      sourceFiles: [context.sourceFiles[0], context.sourceFiles[0]],
    };
    expect(validateFounderOsStagedPatch(repeated, repeatedContext))
      .toContain('staged workspace changed files are unsafe, duplicated, or out of order');
  });

  it('rejects malformed, missing, or oversized staged files', () => {
    const { receipt, context } = fixture();
    expect(validateFounderOsStagedPatch(null, context)).toContain('staged workspace receipt must be an object');
    expect(validateFounderOsStagedPatch({ ...receipt, changes: [] }, context))
      .toContain('staged workspace must contain one to three exact changed file snapshots');
    const oversized = { ...context, changes: [{ path: 'src/example.ts', content: 'x'.repeat(17_000) }] };
    expect(validateFounderOsStagedPatch(receipt, oversized))
      .toContain('staged workspace only accepts bounded non-destructive text edits');
  });
});
