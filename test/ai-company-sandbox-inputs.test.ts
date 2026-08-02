import { describe, expect, it } from 'vitest';
import type { FounderOsLabRequest } from '../src/founder-os-lab/contracts.js';
import { runFounderOsSandbox } from '../src/founder-os-lab/sandbox.js';
// The isolated JavaScript lab intentionally exposes no generated TS declarations.
// @ts-expect-error Runtime input membrane is exercised directly.
import { runCompanySandbox } from '../labs/ai-company/src/sandbox.mjs';

const PROOF_URL = 'https://proof.example.test/sandbox-inputs';

function founderRequest(): FounderOsLabRequest {
  return {
    goal: 'Inspect one sealed Founder OS request.',
    action: 'inspect',
    evidence: {
      repository: 'jussray/founder-control-room',
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      proofUrls: [PROOF_URL],
    },
  };
}

function companyInput() {
  return {
    dataClassification: 'synthetic',
    projectSlug: 'synthetic-founder-project',
    eventId: 'synthetic-sandbox-inputs',
    summary: 'A synthetic input is inspected without executing active properties.',
    requestedMode: 'draft',
    audiences: ['founders'],
    platforms: ['linkedin'],
    proof: {
      projectSlug: 'synthetic-founder-project',
      status: 'ready',
      urls: [PROOF_URL],
    },
    traction: [
      {
        label: 'Synthetic sandbox coverage',
        value: 'active properties rejected',
        sourceUrl: PROOF_URL,
      },
    ],
    governanceAdvantages: [
      {
        label: 'The input membrane inspects descriptors before values',
        proofUrl: PROOF_URL,
      },
    ],
    founderApprovalId: null,
  };
}

function makeAccessorInput<T extends object>(input: T): T {
  let getterCalls = 0;
  Object.defineProperty(input, 'activeField', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'must-not-run';
    },
  });
  Object.defineProperty(input, 'getterCalls', {
    enumerable: false,
    value: () => getterCalls,
  });
  return input;
}

describe('sandbox active-input rejection', () => {
  it('rejects accessors without executing their getter', () => {
    const founder = makeAccessorInput(founderRequest());
    const company = makeAccessorInput(companyInput());
    const founderCounter = (founder as unknown as { getterCalls: () => number }).getterCalls;
    const companyCounter = (company as unknown as { getterCalls: () => number }).getterCalls;

    expect(() => runFounderOsSandbox(founder)).toThrow(/accessor properties are not sandbox-safe/);
    expect(() => runCompanySandbox(company)).toThrow(/accessor properties are not sandbox-safe/);
    expect(founderCounter()).toBe(0);
    expect(companyCounter()).toBe(0);
  });

  it('rejects symbols and hidden fields in both membranes', () => {
    const founderWithSymbol = founderRequest() as FounderOsLabRequest & Record<symbol, string>;
    founderWithSymbol[Symbol('hidden')] = 'secret-shaped-data';
    const companyWithSymbol = companyInput() as ReturnType<typeof companyInput> & Record<symbol, string>;
    companyWithSymbol[Symbol('hidden')] = 'secret-shaped-data';

    expect(() => runFounderOsSandbox(founderWithSymbol)).toThrow(/symbol properties are not sandbox-safe/);
    expect(() => runCompanySandbox(companyWithSymbol)).toThrow(/symbol properties are not sandbox-safe/);

    const founderHidden = founderRequest();
    const companyHidden = companyInput();
    Object.defineProperty(founderHidden, 'hidden', { enumerable: false, value: 'hidden' });
    Object.defineProperty(companyHidden, 'hidden', { enumerable: false, value: 'hidden' });

    expect(() => runFounderOsSandbox(founderHidden)).toThrow(/hidden properties are not sandbox-safe/);
    expect(() => runCompanySandbox(companyHidden)).toThrow(/hidden properties are not sandbox-safe/);
  });

  it('rejects custom properties attached to arrays', () => {
    const founder = founderRequest();
    founder.evidence!.proofUrls = [PROOF_URL];
    Object.assign(founder.evidence!.proofUrls, { liveAdapter: true });

    const company = companyInput();
    Object.assign(company.platforms, { liveAdapter: true });

    expect(() => runFounderOsSandbox(founder)).toThrow(/custom array properties are not sandbox-safe/);
    expect(() => runCompanySandbox(company)).toThrow(/custom array properties are not sandbox-safe/);
  });
});
