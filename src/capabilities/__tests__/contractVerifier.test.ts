import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const verifierPath = join(repoRoot, 'scripts/verify-capability-contract.mjs');
const canonicalContract = JSON.parse(
  readFileSync(join(repoRoot, '.control/capability.json'), 'utf8'),
);
const canonicalLegacyPointer = readFileSync(
  join(repoRoot, '.control/capability.yaml'),
  'utf8',
);
const fixtureRoot = mkdtempSync(join(tmpdir(), 'fcr-capability-contract-'));
let fixtureSequence = 0;

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function runVerifier(
  contract: unknown,
  legacyPointer = canonicalLegacyPointer,
) {
  const sequence = fixtureSequence++;
  const fixturePath = join(fixtureRoot, `contract-${sequence}.json`);
  const legacyFixturePath = join(fixtureRoot, `capability-${sequence}.yaml`);
  writeFileSync(fixturePath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  writeFileSync(legacyFixturePath, legacyPointer, 'utf8');
  return spawnSync(process.execPath, [verifierPath, fixturePath, legacyFixturePath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

describe('Capability Contract verifier', () => {
  it('accepts the canonical cautious repository contract', () => {
    const result = runVerifier(canonicalContract);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Capability contract valid: jussray/founder-control-room');
  });

  it('uses the canonical schema to reject unsupported fields', () => {
    const fixture = structuredClone(canonicalContract);
    fixture.untracked_truth = true;

    const result = runVerifier(fixture);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('$ contains unsupported property');
  });

  it('rejects a verified capability when its referenced proof is stale', () => {
    const fixture = structuredClone(canonicalContract);
    const verifiedCapability = fixture.capabilities.find(
      (capability: { status?: string; evidence_ids?: string[] }) =>
        capability.status === 'verified' && (capability.evidence_ids?.length ?? 0) > 0,
    );
    expect(verifiedCapability).toBeTruthy();

    const evidenceId = verifiedCapability.evidence_ids[0];
    const proof = fixture.proof.find((entry: { id?: string }) => entry.id === evidenceId);
    expect(proof).toBeTruthy();
    proof.status = 'stale';

    const result = runVerifier(fixture);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `${verifiedCapability.id} cannot be verified with stale evidence ${evidenceId}`,
    );
  });

  it('rejects a verified capability without evidence ids', () => {
    const fixture = structuredClone(canonicalContract);
    const verifiedCapability = fixture.capabilities.find(
      (capability: { status?: string }) => capability.status === 'verified',
    );
    expect(verifiedCapability).toBeTruthy();
    verifiedCapability.evidence_ids = [];

    const result = runVerifier(fixture);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `${verifiedCapability.id} cannot be verified without evidence_ids`,
    );
  });

  it('rejects legacy YAML that regains independent capability state', () => {
    const conflictingLegacy = `${canonicalLegacyPointer}\ncapabilities:\n  - id: BUILD\n    status: verified\n`;

    const result = runVerifier(canonicalContract, conflictingLegacy);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'must not carry independent capabilities state',
    );
  });

  it('rejects a legacy YAML pointer that names a different authority', () => {
    const wrongPointer = canonicalLegacyPointer.replace(
      'canonical_source: .control/capability.json',
      'canonical_source: .control/other.json',
    );

    const result = runVerifier(canonicalContract, wrongPointer);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'must point to .control/capability.json as canonical authority',
    );
  });
});
