import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const get = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('canonical FCR skill defines outcome and non-bypassable boundaries', async () => {
  const s = await get('skills/outcome-first/SKILL.md');
  for (const token of ['name: outcome-first', '## Five-field contract', '## Permission boundaries', 'Stop rule', 'VERIFIED', 'UNKNOWN', 'merge', 'deployment']) {
    assert.ok(s.includes(token), 'missing: ' + token);
  }
});

test('six agent surfaces point to one canonical source', async () => {
  for (const path of ['AGENTS.md', 'CODEX.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.agents/skills/outcome-first/SKILL.md', '.claude/skills/outcome-first/SKILL.md', '.cursor/rules', '.windsurf/rules/outcome-first.md']) {
    assert.ok((await get(path)).includes('skills/outcome-first/SKILL.md'), path);
  }
});

test('eight agent behavior scenarios are explicitly unexecuted', async () => {
  const s = await get('skills/outcome-first/ACCEPTANCE-TESTS.md');
  assert.equal((s.match(/^\| [1-8] \|/gm) || []).length, 8);
  assert.match(s, /not-yet-executed behavior tests/i);
});
