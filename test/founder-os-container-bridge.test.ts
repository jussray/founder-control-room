import { describe, expect, it } from 'vitest';
import type { FounderOsLabRequest } from '../src/founder-os-lab/contracts.js';
import { planFounderOsLab } from '../src/founder-os-lab/engine.js';
// The host-side bridge intentionally lives outside the pure TypeScript lab.
// @ts-expect-error Runtime compatibility is proven directly through Vitest.
import { buildFounderOsWorkerRequest } from '../labs/ai-company/process-sandbox/founder-os-bridge.mjs';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROOF = 'https://proof.example.test/founder-os-container-bridge';

function request(action: 'inspect' | 'plan'): FounderOsLabRequest {
  return {
    goal: 'Prepare one synthetic Founder OS evidence brief.',
    action,
    evidence: {
      repository: 'jussray/founder-control-room',
      commitSha: SHA,
      proofUrls: [PROOF],
    },
  };
}

describe('Founder OS to container worker compatibility', () => {
  it.each(['inspect', 'plan'] as const)(
    'maps the real %s plan into one synthetic L0 worker request',
    (action) => {
      const input = request(action);
      const plan = planFounderOsLab(input);
      const worker = buildFounderOsWorkerRequest(input, plan);

      expect(plan.readiness).toBe('ready_for_review');
      expect(plan.route.chiefSkill).toBe('juss-chief-ai');
      expect(plan.authority).toMatchObject({
        level: 'L0',
        mode: 'simulation',
        executionAllowed: false,
      });
      expect(worker).toMatchObject({
        version: 'synthetic-employee-request-v1',
        dataClassification: 'synthetic',
        employee: 'synthetic-evidence-analyst',
        authority: {
          level: 'L0',
          mode: 'simulation',
          executionAllowed: false,
        },
        task: {
          kind: 'evidence-brief',
          goal: input.goal,
          audiences: ['founder-control-plane'],
        },
      });
      expect(worker.task.facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Exact source commit',
            value: SHA,
            proofUrl: PROOF,
          }),
          expect.objectContaining({
            label: 'Founder OS route',
            value: `juss-chief-ai -> ${plan.route.specialistSkill}`,
            proofUrl: PROOF,
          }),
        ]),
      );
    },
  );

  it('does not treat founder approval as permission to enter the worker', () => {
    const input: FounderOsLabRequest = {
      goal: 'Merge synthetic code.',
      action: 'merge-code',
      approval: {
        id: 'founder-approved:synthetic-container-bridge',
        actions: ['merge-code'],
      },
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF],
      },
    };
    const plan = planFounderOsLab(input);

    expect(plan.readiness).toBe('ready_for_external_executor');
    expect(plan.authority.approvalObserved).toBe(true);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(() => buildFounderOsWorkerRequest(input, plan)).toThrow(
      /only inspect and plan may enter the container worker/,
    );
  });
});
