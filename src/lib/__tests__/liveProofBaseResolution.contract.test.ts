import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

const documentationTruth = read('.github/workflows/documentation-truth.yml');
const ci = read('.github/workflows/ci.yml');

function expectLiveBaseResolver(workflow: string): void {
  expect(workflow).not.toContain('github.event.pull_request.base.sha');
  expect(workflow).toContain("BASE_REF: ${{ github.event.pull_request.base.ref || '' }}");
  expect(workflow).toContain('git check-ref-format "refs/heads/${BASE_REF}"');
  expect(workflow).toContain('git ls-remote --heads origin "refs/heads/${BASE_REF}"');
  expect(workflow).toContain('git fetch --no-tags origin "$live_base_sha"');
  expect(workflow).toContain('git merge-base --is-ancestor "$live_base_sha" "$EXPECTED_HEAD_SHA"');
  expect(workflow).toContain('PUSH_BEFORE_SHA: ${{ github.event.before || \'\' }}');
  expect(workflow).toContain('0000000000000000000000000000000000000000');
}

describe('live proof base resolution contract', () => {
  it('binds the standalone Documentation Truth gate to the live target branch instead of the event snapshot', () => {
    expectLiveBaseResolver(documentationTruth);
    expect(documentationTruth).toContain("printf 'DOC_TRUTH_BASE_SHA=%s\\n' \"$live_base_sha\" >> \"$GITHUB_ENV\"");
  });

  it('binds both CI proof consumers to the live target branch instead of the event snapshot', () => {
    expectLiveBaseResolver(ci);
    expect(ci).toContain("printf 'DOC_TRUTH_BASE_SHA=%s\\n' \"$live_base_sha\" >> \"$GITHUB_ENV\"");
    expect(ci).toContain("printf 'TEST_DISCOVERY_BASE_SHA=%s\\n' \"$live_base_sha\" >> \"$GITHUB_ENV\"");
  });
});

function resolverScripts(workflow: string): string[] {
  const lines = workflow.split('\n');
  return lines.flatMap((line, index) => {
    if (line !== '      - name: Resolve exact live base') return [];
    const runIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate === '        run: |');
    if (runIndex < 0) throw new Error('Live-base resolver must have an executable shell body');
    const script: string[] = [];
    for (const candidate of lines.slice(runIndex + 1)) {
      if (candidate && !candidate.startsWith('          ')) break;
      script.push(candidate.slice(10));
    }
    return [script.join('\n')];
  });
}

const resolvers = [
  ...resolverScripts(documentationTruth).map((script) => ({ label: 'standalone documentation', outputName: 'DOC_TRUTH_BASE_SHA', script })),
  ...resolverScripts(ci).map((script) => ({
    label: script.includes("printf 'DOC_TRUTH_BASE_SHA=") ? 'CI documentation' : 'CI test discovery',
    outputName: script.includes("printf 'DOC_TRUTH_BASE_SHA=") ? 'DOC_TRUTH_BASE_SHA' : 'TEST_DISCOVERY_BASE_SHA',
    script,
  })),
];

describe('live-base shell behavior against real local Git repositories', () => {
  it('exercises all three load-bearing workflow resolver bodies', () => {
    expect(resolvers.map(({ label }) => label)).toEqual(['standalone documentation', 'CI documentation', 'CI test discovery']);
  });

  describe.each(resolvers)('$label', ({ outputName, script }) => {
    let fixture: string;
    let repository: string;
    let remote: string;
    let environmentFile: string;
    let staleBaseSha: string;
    let baseSha: string;
    let headSha: string;

    function git(...args: string[]): string {
      return execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    }

    function run(overrides: Record<string, string> = {}) {
      const result = spawnSync('bash', ['-c', script], {
        cwd: repository,
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          EVENT_NAME: 'pull_request',
          BASE_REF: 'main',
          PUSH_BEFORE_SHA: staleBaseSha,
          EXPECTED_HEAD_SHA: headSha,
          GITHUB_ENV: environmentFile,
          ...overrides,
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      return { ...result, exported: readFileSync(environmentFile, 'utf8') };
    }

    function expectRejected(overrides: Record<string, string>) {
      const result = run(overrides);
      expect(result.status).not.toBe(0);
      expect(result.exported).toBe('');
      return result;
    }

    beforeEach(() => {
      fixture = mkdtempSync(join(tmpdir(), 'fcr-live-proof-base-'));
      repository = join(fixture, 'candidate');
      remote = join(fixture, 'origin.git');
      environmentFile = join(fixture, 'github-env');
      mkdirSync(repository);
      writeFileSync(environmentFile, '');
      git('init', '--bare', remote);
      git('init', '--initial-branch=main');
      git('config', 'user.name', 'FCR resolver test');
      git('config', 'user.email', 'resolver-test@example.invalid');
      git('commit', '--allow-empty', '-m', 'historical event base');
      staleBaseSha = git('rev-parse', 'HEAD');
      git('commit', '--allow-empty', '-m', 'live target base');
      baseSha = git('rev-parse', 'HEAD');
      git('remote', 'add', 'origin', remote);
      git('push', 'origin', 'HEAD:refs/heads/main');
      git('commit', '--allow-empty', '-m', 'candidate change');
      headSha = git('rev-parse', 'HEAD');
    });

    afterEach(() => {
      rmSync(fixture, { recursive: true, force: true });
    });

    it('uses the freshly resolved target branch instead of the historical event SHA', () => {
      const result = run();
      expect(result.status).toBe(0);
      expect(result.exported).toBe(`${outputName}=${baseSha}\n`);
      expect(result.stdout).toContain(`resolved_base_sha=${baseSha}`);
    });

    it('resolves the requested target branch rather than assuming main', () => {
      git('push', 'origin', `${staleBaseSha}:refs/heads/release`);
      const result = run({ BASE_REF: 'release' });
      expect(result.status).toBe(0);
      expect(result.exported).toBe(`${outputName}=${staleBaseSha}\n`);
    });

    it.each(['', 'bad..ref', 'missing-branch'])('rejects missing, invalid or unresolved target ref %s', (baseRef) => {
      expectRejected({ BASE_REF: baseRef });
    });

    it('rejects a live target that is not an ancestor of the exact candidate', () => {
      const divergentSha = git('commit-tree', 'HEAD^{tree}', '-p', staleBaseSha, '-m', 'divergent live base');
      git('push', 'origin', `${divergentSha}:refs/heads/diverged`);
      const result = expectRejected({ BASE_REF: 'diverged' });
      expect(result.stderr).toContain('live base is not an ancestor');
    });

    it('rejects failed remote fetches without exporting a usable proof base', () => {
      const executableDirectory = join(fixture, 'failing-fetch');
      mkdirSync(executableDirectory);
      const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      // Git is an external process boundary; only this transport failure is injected.
      writeFileSync(join(executableDirectory, 'git'), `#!/bin/sh\nif [ "$1" = "fetch" ]; then exit 72; fi\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
      expectRejected({ PATH: `${executableDirectory}${delimiter}${process.env.PATH ?? ''}` });
    });

    it('uses the exact push-before SHA for a default-branch push', () => {
      const result = run({ EVENT_NAME: 'push', BASE_REF: '', PUSH_BEFORE_SHA: staleBaseSha });
      expect(result.status).toBe(0);
      expect(result.exported).toBe(`${outputName}=${staleBaseSha}\n`);
    });

    it.each(['', 'not-a-sha', '0'.repeat(40)])('rejects an invalid push-before identity %s', (beforeSha) => {
      expectRejected({ EVENT_NAME: 'push', PUSH_BEFORE_SHA: beforeSha });
    });
  });
});
