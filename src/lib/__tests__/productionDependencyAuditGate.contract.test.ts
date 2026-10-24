import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = readFileSync(
  resolve(repositoryRoot, '.github/workflows/ci.yml'),
  'utf8',
);

describe('production dependency audit merge gate', () => {
  it('runs a locked production audit on pull requests without package install scripts', () => {
    expect(workflow).toContain('production-dependencies:');
    expect(workflow).toContain('name: Production dependency audit');
    expect(workflow).toContain('npm ci --ignore-scripts --no-audit --no-fund');
    expect(workflow).toContain('npm audit --omit=dev --audit-level=high');
  });

  it('makes the dependency audit load-bearing in Required Gate', () => {
    const requiredGate = workflow.slice(workflow.indexOf('  required-gate:'));
    expect(requiredGate).toContain('- production-dependencies');
    expect(requiredGate).toContain('PRODUCTION_DEPENDENCIES_RESULT:');
    expect(requiredGate).toContain('"$PRODUCTION_DEPENDENCIES_RESULT"');
  });
});
