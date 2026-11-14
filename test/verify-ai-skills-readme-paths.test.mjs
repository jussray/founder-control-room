import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {findMissingLocalPaths} from '../scripts/verify-ai-skills-readme-paths.mjs';

function withRepo(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ai-readme-path-'));
  try {
    mkdirSync(join(root, '.ai-skills', 'skills'), {recursive: true});
    mkdirSync(join(root, '.ai-skills', 'gpts'), {recursive: true});
    mkdirSync(join(root, 'src', 'lib'), {recursive: true});
    writeFileSync(join(root, '.ai-skills', 'skills', 'good.md'), 'ok');
    writeFileSync(join(root, 'src', 'lib', 'file.ts'), 'ok');
    fn(root);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

test('accepts local links, relative backticks, root paths and directories', () => withRepo(root => {
  const readme = '[Good](skills/good.md) `skills/good.md` `skills/` `gpts/` `src/lib/file.ts` `.ai-skills/`';
  assert.deepEqual(findMissingLocalPaths(readme, root), []);
}));

test('fails a missing backticked file and a missing markdown link', () => withRepo(root => {
  const missing = findMissingLocalPaths('`minimal-token-operating-protocol.md` [Bad](skills/missing.md)', root);
  assert.deepEqual(missing, ['minimal-token-operating-protocol.md', 'skills/missing.md']);
}));

test('rejects missing directory paths and legacy inline paths', () => withRepo(root => {
  assert.deepEqual(findMissingLocalPaths('`cross-platform/` `perplexity-skills/`', root), ['cross-platform/', 'perplexity-skills/']);
}));

test('does not treat commands, external canonical links, packages or fenced examples as local paths', () => withRepo(root => {
  const readme = [
    '`/truth` `save_custom_skill` `juss/portable-control-input@v1`',
    '[Canonical](https://github.com/jussray/founder-control-room/blob/main/.ai-skills/skills/other.md)',
    '```text',
    '`not-an-existing-file.md`',
    '```',
  ].join('\n');
  assert.deepEqual(findMissingLocalPaths(readme, root), []);
}));

test('fails closed on path traversal outside the repository', () => withRepo(root => {
  assert.deepEqual(findMissingLocalPaths('[Outside](../../forbidden.md)', root), ['../../forbidden.md']);
}));
