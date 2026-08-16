import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const bridgePath = fileURLToPath(
  new URL('../../../public/control-room/v10-plan-bridge.js', import.meta.url),
);
const source = readFileSync(bridgePath, 'utf8');

describe('Founder Control Room completion claim UI contract', () => {
  it('never upgrades an execution response to completion without a named receipt and exact evidence', () => {
    expect(source).toContain("response.clone().json()");
    expect(source).toContain("completion is not claimed: execution receipt unavailable");
    expect(source).toContain("exact completion evidence is incomplete");
    expect(source).toContain("Merge witnessed. Evidence: execution ${receipt}");
    expect(source).toContain("Branch witnessed. Evidence: execution ${receipt}");
    expect(source).toContain("result.expectedHeadSha");
    expect(source).toContain("result.evidence");
  });

  it('downgrades provider success when downstream state reports warnings', () => {
    expect(source).toContain("Array.isArray(result.warnings)");
    expect(source).toContain("completion is not claimed. Evidence: execution ${receipt}. Warning:");
  });

  it('replaces the legacy optimistic UI claims only after inspecting the execution payload', () => {
    expect(source).toContain("'Merge executed.'");
    expect(source).toContain("'Branch created.'");
    expect(source).toContain("applyEvidenceBackedCompletionClaim");
    expect(source).toContain("data-completion-claim");
  });
});
