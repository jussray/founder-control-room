import { describe, expect, it } from 'vitest';
import {
  runGoal,
  proposalDigest,
  type AdvisoryContext,
  type Approval,
  type Task,
  type TrustedTools,
} from '../founderOperatorContract.js';

const HEAD = 'a'.repeat(40);
const NEXT_HEAD = 'b'.repeat(40);
const task: Task = {
  repo: 'jussray/founder-control-room',
  branch: 'review/operator-narrow-fix',
  expectedHead: HEAD,
  goal: 'Repair the existing operator flow',
  focusFiles: ['src/guard.ts'],
  surface: 'backend',
  providerChange: false,
};
const approval: Approval = {
  operation: 'patch',
  repo: task.repo,
  branch: task.branch,
  head: HEAD,
  files: ['src/guard.ts'],
  approvalId: 'fcr-approval-1',
  proposalHash: proposalDigest(task, { cause: 'Verified narrow blocker', files: ['src/guard.ts'], diff: 'focused-change' }),
};

function harness(overrides: Partial<TrustedTools> = {}) {
  let observedHead = HEAD;
  let writes = 0;
  const receipts: Array<Awaited<ReturnType<typeof runGoal>>> = [];
  const tools: TrustedTools = {
    getHead: async () => observedHead,
    diagnose: async () => ({
      cause: 'Verified narrow blocker',
      files: ['src/guard.ts'],
      diff: 'focused-change',
    }),
    readSol: async () => ({
      repo: task.repo,
      branch: task.branch,
      head: HEAD,
      snapshotRef: 'sol:receipt:1',
      decisionRefs: ['sol:decision:1'],
      summary: 'Previously approved design remains locked.',
    }),
    selectPrompt: async () => ({
      repo: task.repo,
      id: 'goalfix',
      version: '1.1.0',
      registryRef: 'promptos:approved:goalfix:1.1.0',
      integrityDigest: 'sha256:approved',
      approved: true,
      applicableFiles: ['src/guard.ts'],
    }),
    isProtectedBranch: async () => false,
    classify: async () => ({ surface: 'backend' }),
    verifyApproval: async () => true,
    reserve: async () => 'fcr-reservation-1',
    inspectCommit: async () => ({ parentSha: HEAD, changedFiles: ['src/guard.ts'] }),
    applyPatch: async (_task, _proposal, _files, expectedHead) => {
      if (observedHead !== expectedHead) throw new Error('stale branch: atomic compare-and-swap rejected');
      writes += 1;
      observedHead = NEXT_HEAD;
      return { sha: NEXT_HEAD, changedFiles: ['src/guard.ts'] };
    },
    prove: async (_task, sha) => [{
      kind: 'focused-check' as const,
      sha,
      passed: true,
      reference: 'https://github.com/jussray/founder-control-room/actions/runs/123',
      observation: 'focused test executed',
      observedAt: new Date().toISOString(),
    }],
    record: async receipt => { receipts.push(receipt); },
    ...overrides,
  };
  return { tools, receipts, get writes() { return writes; } };
}

describe('four-system founder operator authority boundary', () => {
  it('does not mutate without a candidate-bound approval', async () => {
    const h = harness();
    const result = await runGoal(task, h.tools);
    expect(result.status).toBe('NEEDS_APPROVAL');
    expect(h.writes).toBe(0);
    expect(h.receipts).toHaveLength(1);
  });

  it('blocks a stale source head before diagnosing', async () => {
    const h = harness({
      getHead: async () => NEXT_HEAD,
      diagnose: async () => { throw new Error('must never diagnose'); },
    });
    expect((await runGoal(task, h.tools, approval)).status).toBe('BLOCKED');
    expect(h.writes).toBe(0);
  });

  it('rejects a patch outside the founder-approved file allowlist', async () => {
    const h = harness({
      diagnose: async () => ({
        cause: 'Overbroad change',
        files: ['src/unrelated.ts'],
        diff: 'not-allowed',
      }),
    });
    expect((await runGoal(task, h.tools, approval)).status).toBe('BLOCKED');
    expect(h.writes).toBe(0);
  });

  it('requires a separately verified FCR approval rather than claimed approval text', async () => {
    const h = harness({ verifyApproval: async () => false });
    const result = await runGoal(task, h.tools, approval);
    expect(result.status).toBe('NEEDS_APPROVAL');
    expect(h.writes).toBe(0);
  });

  it('passes expected head to the atomic patch adapter and rejects a write-time race', async () => {
    let currentHead = HEAD;
    let writes = 0;
    const h = harness({
      getHead: async () => currentHead,
      verifyApproval: async () => { currentHead = NEXT_HEAD; return true; },
      applyPatch: async (_task, _proposal, _files, expectedHead) => {
        if (currentHead !== expectedHead) throw new Error('atomic compare-and-swap rejected');
        writes++;
        return { sha: NEXT_HEAD, changedFiles: ['src/guard.ts'] };
      },
    });
    const result = await runGoal(task, h.tools, approval);
    expect(result.status).toBe('BLOCKED');
    expect(writes).toBe(0);
  });

  it('passes a narrow backend repair with matching exact-head focused evidence', async () => {
    const h = harness();
    const result = await runGoal(task, h.tools, approval);
    expect(result.status).toBe('VERIFIED');
    expect(result.resultHead).toBe(NEXT_HEAD);
    expect(h.writes).toBe(1);
    expect(h.receipts).toHaveLength(1);
    expect(result.support.promptId).toBe('goalfix');
    expect(result.support.solSnapshotRef).toBe('sol:receipt:1');
  });

  it('requires Playwright proof for a UI repair, not only focused tests', async () => {
    const h = harness();
    const result = await runGoal({ ...task, surface: 'ui' }, h.tools, approval);
    expect(result.status).toBe('BLOCKED');
    expect(result.nextGate).toContain('reverify');
  });

  it('requires independent provider readback for external changes', async () => {
    const h = harness();
    const result = await runGoal({ ...task, providerChange: true }, h.tools, approval);
    expect(result.status).toBe('BLOCKED');
  });

  it('discards stale Sol advice and unauthorized PromptOS selections', async () => {
    let seen: AdvisoryContext | undefined;
    const h = harness({
      readSol: async () => ({
        repo: task.repo, branch: task.branch, head: NEXT_HEAD,
        snapshotRef: 'sol:stale', decisionRefs: [], summary: 'ignore',
      }),
      selectPrompt: async () => ({
        repo: task.repo, id: 'unapproved', version: '1',
        registryRef: 'promptos:unapproved', integrityDigest: 'sha256:unapproved',
        approved: false, applicableFiles: ['src/guard.ts'],
      }),
      diagnose: async (_task, context) => {
        seen = context;
        return { cause: 'narrow blocker', files: ['src/guard.ts'], diff: 'small' };
      },
    });
    const result = await runGoal(task, h.tools, approval);
    expect(seen?.sol).toBeUndefined();
    expect(seen?.promptos).toBeUndefined();
    expect(result.support.warnings).toHaveLength(2);
  });

  it('advisory outage does not grant or revoke FCR authority', async () => {
    const h = harness({
      readSol: async () => { throw new Error('offline'); },
      selectPrompt: async () => { throw new Error('offline'); },
    });
    const result = await runGoal(task, h.tools, approval);
    expect(result.status).toBe('VERIFIED');
    expect(result.support.warnings).toHaveLength(2);
  });

  it('receipt persistence failure prevents a verified completion claim', async () => {
    const h = harness({ record: async () => { throw new Error('write failed'); } });
    const result = await runGoal(task, h.tools, approval);
    expect(result.status).toBe('BLOCKED');
    expect(result.risk).toContain('not durable');
  });

  it('does not accept fabricated proof from a different commit', async () => {
    const h = harness({
      prove: async () => [{
        kind: 'focused-check', sha: HEAD, passed: true,
        reference: 'https://example.org/old-proof', observation: 'old head',
        observedAt: new Date().toISOString(),
      }],
    });
    const result = await runGoal(task, h.tools, approval);
    expect(result.status).toBe('BLOCKED');
  });
});

describe('adversarial operator execution gates', () => {
  it('rejects protected main and remote-protected branches', async () => {
    const direct = harness();
    expect((await runGoal({ ...task, branch: 'main' }, direct.tools,
      { ...approval, branch: 'main' })).status).toBe('BLOCKED');
    expect(direct.writes).toBe(0);
    const protectedBranch = harness({ isProtectedBranch: async () => true });
    expect((await runGoal(task, protectedBranch.tools, approval)).status).toBe('BLOCKED');
    expect(protectedBranch.writes).toBe(0);
  });

  it('rejects path traversal before a repository mutation', async () => {
    for (const path of ['../secret.txt', '/etc/hosts', 'src/../secret.ts', 'C:/secret.txt']) {
      const h = harness();
      expect((await runGoal({ ...task, focusFiles: [path] }, h.tools, approval)).status).toBe('BLOCKED');
      expect(h.writes).toBe(0);
    }
  });

  it('does not allow an approval to authorize another diff on identical files', async () => {
    const h = harness({ diagnose: async () => ({
      cause: 'Different proposal', files: ['src/guard.ts'], diff: 'new unauthorized diff',
    }) });
    expect((await runGoal(task, h.tools, approval)).status).toBe('NEEDS_APPROVAL');
    expect(h.writes).toBe(0);
  });

  it('prevents writes when the pending receipt cannot be reserved', async () => {
    const h = harness({ reserve: async () => { throw new Error('sensitive_token_in_provider_error'); } });
    const result = await runGoal(task, h.tools, approval);
    expect(result.status).toBe('BLOCKED');
    expect(result.reality).not.toContain('sensitive_token_in_provider_error');
    expect(h.writes).toBe(0);
  });

  it('passes proposal files rather than wider approval files to execution', async () => {
    let allowlist: readonly string[] = [];
    const h = harness({ applyPatch: async (_task, _proposal, files) => {
      allowlist = files;
      return { sha: NEXT_HEAD, changedFiles: ['src/guard.ts'] };
    } });
    const result = await runGoal(task, h.tools, { ...approval, files: ['src/guard.ts', 'src/other.ts'] });
    expect(result.status).toBe('BLOCKED');
    expect(allowlist).toEqual(['src/guard.ts']);
  });

  it('denies fake unchanged-head patches and wrong parent commit ancestry', async () => {
    const same = harness({ applyPatch: async () => ({ sha: HEAD, changedFiles: ['src/guard.ts'] }) });
    expect((await runGoal(task, same.tools, approval)).status).toBe('BLOCKED');
    const wrongParent = harness({ inspectCommit: async () => ({
      parentSha: 'c'.repeat(40), changedFiles: ['src/guard.ts'],
    }) });
    expect((await runGoal(task, wrongParent.tools, approval)).status).toBe('BLOCKED');
  });

  it('requires real UI and Documentation Truth checks based on trusted classification', async () => {
    const ui = harness({ classify: async () => ({ surface: 'ui' }) });
    expect((await runGoal(task, ui.tools, approval)).status).toBe('BLOCKED');
    const docs = harness({ classify: async () => ({ surface: 'docs', documentationTruth: true }) });
    expect((await runGoal(task, docs.tools, approval)).status).toBe('BLOCKED');
  });

  it('rejects a provider readback from the wrong environment', async () => {
    const h = harness({
      classify: async () => ({ surface: 'backend', providerTarget: 'production:worker/fcr' }),
      prove: async (_task, sha) => [
        { kind: 'focused-check', sha, passed: true, reference: 'https://example.org/ci',
          observation: 'CI', observedAt: new Date().toISOString() },
        { kind: 'provider-readback', sha, passed: true, reference: 'https://example.org/readback',
          observation: 'readback', observedAt: new Date().toISOString(), target: 'staging:worker/fcr',
          revision: 'rev-1' },
      ],
    });
    expect((await runGoal(task, h.tools, approval)).status).toBe('BLOCKED');
  });

  it('excludes stale, unrelated evidence from verified receipts', async () => {
    const h = harness({ prove: async (_task, sha) => [
      { kind: 'focused-check', sha, passed: true, reference: 'https://example.org/ci',
        observation: 'valid', observedAt: new Date().toISOString() },
      { kind: 'focused-check', sha: HEAD, passed: true, reference: 'https://example.org/old',
        observation: 'old', observedAt: new Date(Date.now() - 86400000).toISOString() },
    ] });
    const result = await runGoal(task, h.tools, approval);
    expect(result.status).toBe('VERIFIED');
    expect(result.evidence).toHaveLength(1);
  });

  it('persists the PromptOS method integrity digest in support receipts', async () => {
    const h = harness();
    expect((await runGoal(task, h.tools, approval)).support.promptIntegrityDigest).toBe('sha256:approved');
  });
});
