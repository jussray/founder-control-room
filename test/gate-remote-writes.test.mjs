import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve('.claude/hooks/gate-remote-writes.sh');

function repoOn(branch) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-hook-'));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', branch);
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}

function decide(command, projectDir) {
  const out = spawnSync('bash', [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    cwd: projectDir,
  });
  assert.equal(out.status, 0, out.stderr);
  if (!out.stdout.trim()) return 'allow';
  return JSON.parse(out.stdout).hookSpecificOutput.permissionDecision;
}

test('denies pushes to main/production however the command is wrapped', () => {
  const dir = repoOn('feature/x');
  try {
    for (const command of [
      'git push origin main',
      'git push -u origin HEAD:refs/heads/main',
      'git push origin +production',
      'cd /tmp && git push origin main',
      // Previously allowed: `git` was not the first word of the segment.
      'for i in 1 2; do git push origin main; done',
      'for i in 1 2 3 4; do git push origin HEAD:main 2>&1 | tail -2 && break; sleep 2; done',
      'env GIT_TRACE=0 git push origin main',
      'timeout 30 git push origin HEAD:production',
      'if true; then git push origin main; fi',
    ]) {
      assert.equal(decide(command, dir), 'deny', command);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('denies a bare push from a protected branch even with -c config flags', () => {
  const dir = repoOn('main');
  try {
    assert.equal(decide('git push', dir), 'deny');
    // Previously allowed: the -c value was treated as a -C directory.
    assert.equal(decide('git -c http.extraHeader=x push', dir), 'deny');
    assert.equal(decide(`git -C ${dir} push`, dir), 'deny');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('allows ordinary feature-branch pushes and asks on force pushes', () => {
  const dir = repoOn('feature/x');
  try {
    assert.equal(decide('git push -u origin feature/x', dir), 'allow');
    assert.equal(decide('for i in 1 2; do git push origin HEAD:feature/x && break; done', dir), 'allow');
    assert.equal(decide('git -c core.x=y push origin feature/x', dir), 'allow');
    assert.equal(decide('git push --force-with-lease origin feature/x', dir), 'ask');
    assert.equal(decide('git status', dir), 'allow');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
