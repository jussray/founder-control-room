import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const deployWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);

function deployJobBlock(name: string, nextName?: string) {
  const suffix = nextName ? `(?=\\n  ${nextName}:\\n)` : '$';
  const pattern = new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)${suffix}`);
  const block = deployWorkflow.match(pattern);
  expect(block).not.toBeNull();
  return block![1];
}

describe('post-deploy reconciliation release gate', () => {
  it('fails closed on post-deploy drift before proof-of-ship can schedule publication', () => {
    const proofOfShip = deployJobBlock('proof-of-ship', 'reconcile');
    const postDeployReconcile = deployJobBlock('reconcile');

    expect(postDeployReconcile).toContain('environment: production');
    expect(postDeployReconcile).toContain('needs: smoke-test');
    expect(postDeployReconcile).not.toContain('continue-on-error: true');
    expect(postDeployReconcile).toContain('npx tsx src/reconciliation/scripts/self-reconcile.ts');
    expect(proofOfShip).toContain('needs: reconcile');
    expect(proofOfShip).toContain("if: needs.reconcile.result == 'success'");
  });
});
