import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type EvaluateInput = { deployments: unknown; version: unknown; expectedSha: unknown };
type EvaluateResult = {
  ok: boolean;
  activeVersionId: string | null;
  observedTag: string | null;
  failures: string[];
};
type TagModule = {
  extractJson: (text: string) => unknown;
  selectActiveVersionId: (deployments: unknown) => string;
  evaluateWorkerVersionTag: (input: EvaluateInput) => EvaluateResult;
};

const scriptUrl = new URL('../../../scripts/worker-deployment-version-tag.mjs', import.meta.url);
const tag = (await import(scriptUrl.href)) as TagModule;

const deployWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

function deployment(createdOn: string, versions: Array<{ version_id: string; percentage: number }>) {
  return { id: `d-${createdOn}`, created_on: createdOn, versions };
}

const oldDeployment = deployment('2026-11-12T21:47:00.000Z', [{ version_id: 'v-old', percentage: 100 }]);
const newDeployment = deployment('2026-11-15T20:00:00.000Z', [{ version_id: 'v-new', percentage: 100 }]);

describe('Worker deployment version tag readback', () => {
  it('passes only when the newest 100% version carries the exact SHA tag', () => {
    const result = tag.evaluateWorkerVersionTag({
      deployments: [newDeployment, oldDeployment],
      version: { id: 'v-new', annotations: { 'workers/tag': SHA, 'workers/message': 'x' } },
      expectedSha: SHA,
    });
    expect(result).toMatchObject({ ok: true, activeVersionId: 'v-new', observedTag: SHA, failures: [] });
  });

  it('selects the newest deployment regardless of provider list order', () => {
    expect(tag.selectActiveVersionId([oldDeployment, newDeployment])).toBe('v-new');
    expect(tag.selectActiveVersionId([newDeployment, oldDeployment])).toBe('v-new');
  });

  it('fails when the tag is a different SHA, missing, or a prefix', () => {
    for (const annotations of [{ 'workers/tag': OTHER_SHA }, {}, { 'workers/tag': SHA.slice(0, 12) }]) {
      const result = tag.evaluateWorkerVersionTag({
        deployments: [newDeployment],
        version: { id: 'v-new', annotations },
        expectedSha: SHA,
      });
      expect(result.ok).toBe(false);
    }
    // Historical stub versions carry no annotations at all.
    expect(
      tag.evaluateWorkerVersionTag({ deployments: [newDeployment], version: { id: 'v-new' }, expectedSha: SHA }).ok,
    ).toBe(false);
  });

  it('fails when the viewed version is not the active one', () => {
    const result = tag.evaluateWorkerVersionTag({
      deployments: [newDeployment],
      version: { id: 'v-old', annotations: { 'workers/tag': SHA } },
      expectedSha: SHA,
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('does not match the active deployment');
  });

  it('fails closed on split traffic, empty deployments, and malformed input', () => {
    const split = deployment('2026-11-15T21:00:00.000Z', [
      { version_id: 'v-new', percentage: 50 },
      { version_id: 'v-old', percentage: 50 },
    ]);
    const partial = deployment('2026-11-15T21:00:00.000Z', [{ version_id: 'v-new', percentage: 90 }]);
    for (const deployments of [[split], [partial], [], null, [{ versions: [] }]]) {
      expect(() => tag.selectActiveVersionId(deployments)).toThrow();
      expect(
        tag.evaluateWorkerVersionTag({
          deployments,
          version: { id: 'v-new', annotations: { 'workers/tag': SHA } },
          expectedSha: SHA,
        }).ok,
      ).toBe(false);
    }
  });

  it('rejects a non-exact expected SHA even when tag and expectation agree', () => {
    for (const expectedSha of ['', SHA.slice(0, 7), SHA.toUpperCase(), undefined]) {
      const result = tag.evaluateWorkerVersionTag({
        deployments: [newDeployment],
        version: { id: 'v-new', annotations: { 'workers/tag': expectedSha } },
        expectedSha,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('extracts JSON after wrangler progress lines that contain brackets', () => {
    const text = '[WARNING] Proxy environment variables detected.\nGetting deployments...\n[\n  {"id": "d"}\n]\n';
    expect(tag.extractJson(text)).toEqual([{ id: 'd' }]);
    expect(() => tag.extractJson('no json here')).toThrow();
  });
});

describe('deploy.yml Worker version tag wiring', () => {
  it('tags the production Worker version with the exact approved SHA', () => {
    expect(deployWorkflow).toContain(
      'command: deploy --config wrangler.worker.toml --var GIT_SHA:${{ inputs.expected_head_sha }} --tag ${{ inputs.expected_head_sha }} --message fcr-deploy-run-${{ github.run_id }}.${{ github.run_attempt }}',
    );
  });

  it('reads back the active version tag in the deploy job, after deploy and before Pages release', () => {
    const deployStep = deployWorkflow.indexOf('command: deploy --config wrangler.worker.toml');
    const readback = deployWorkflow.indexOf('- name: Read back active Worker version tag (fail closed)');
    const pagesRelease = deployWorkflow.indexOf('\n  pages-release:');
    expect(deployStep).toBeGreaterThan(-1);
    expect(readback).toBeGreaterThan(deployStep);
    expect(pagesRelease).toBeGreaterThan(readback);
    const step = deployWorkflow.slice(readback, pagesRelease);
    expect(step).toContain('deployments list');
    expect(step).toContain('versions view "$active_version_id"');
    expect(step).toContain(
      'node scripts/worker-deployment-version-tag.mjs verify \\\n            "$deployments_receipt" "$version_receipt" "$EXPECTED_HEAD_SHA"',
    );
    expect(step).toContain('EXPECTED_HEAD_SHA: ${{ inputs.expected_head_sha }}');
    expect(step).not.toMatch(/secret (put|bulk|delete)|wrangler@\S+ deploy(?!ments)|versions (upload|deploy)/);
  });
});
