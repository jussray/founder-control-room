import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { dispatchCourtWitnessBridge } from '../courtWitnessBridge.js';

type JsonRecord = Record<string, any>;

const AUTHORITY = Object.freeze({
  evidenceOnly: true,
  createsTruth: false,
  createsAuthority: false,
  executionAuthorized: false,
  mergeAuthorized: false,
  deployAuthorized: false,
  publishAuthorized: false,
  credentialMutationAuthorized: false,
  providerMutationAuthorized: false,
});

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function withFingerprint<T extends JsonRecord>(value: T, key: string): T & JsonRecord {
  const core: JsonRecord = { ...value };
  delete core[key];
  return { ...core, [key]: fingerprint(core) } as T & JsonRecord;
}

function packet() {
  return {
    caseId: 'court-case-1',
    founderGoal: 'Prove current FCR evidence.',
    project: 'Founder Control Room',
    repository: 'jussray/founder-control-room',
    branch: 'main',
    headSha: 'a'.repeat(40),
    observedAt: '2026-10-06T05:00:00Z',
    expiresAt: '2026-10-06T06:00:00Z',
    authorityCeiling: 'observe-only',
    stopCondition: 'return proof only',
    witnesses: [],
  };
}

function kodyResponse(input = packet()) {
  const receiptCore = {
    schema: 'juss/court-council-witness@v1',
    caseId: input.caseId,
    founderGoal: input.founderGoal,
    project: input.project,
    repository: input.repository,
    branch: input.branch,
    headSha: input.headSha,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    authorityCeiling: input.authorityCeiling,
    stopCondition: input.stopCondition,
    witnesses: [],
    authority: AUTHORITY,
    evidenceSummary: {
      total: 0,
      admissible: 0,
      stale: 0,
      uniqueChains: 0,
      duplicateChains: 0,
      statuses: { VERIFIED: 0, INFERRED: 0, UNKNOWN: 0, BLOCKED: 0, FAIL: 0 },
    },
  };
  const receipt = withFingerprint({ ...receiptCore }, 'receiptFingerprint');
  const common = {
    caseId: input.caseId,
    repository: input.repository,
    branch: input.branch,
    headSha: input.headSha,
    witnessReceiptFingerprint: receipt.receiptFingerprint,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
    authority: AUTHORITY,
  };
  const sol = withFingerprint({
    schema: 'juss/sol-court-continuity-handoff@v1',
    ...common,
    task: 'challenge continuity',
    evidenceSummary: receipt.evidenceSummary,
    witnesses: [],
  }, 'handoffFingerprint');
  const promptos = withFingerprint({
    schema: 'juss/promptos-court-compile-handoff@v1',
    ...common,
    task: 'compile next proof',
    founderGoal: input.founderGoal,
    stopCondition: input.stopCondition,
    constraints: ['preserve truth states'],
  }, 'handoffFingerprint');

  return {
    ok: true,
    schema: 'juss/fcr-court-witness-webhook-response@v1',
    receipt,
    handoffs: {
      schema: 'juss/court-council-handoffs@v1',
      sourceReceiptFingerprint: receipt.receiptFingerprint,
      sol,
      promptos,
      authority: AUTHORITY,
    },
    authority: AUTHORITY,
  };
}

function solResponse(kody: ReturnType<typeof kodyResponse>) {
  const identity = {
    version: 1,
    kind: 'sol/court-continuity@v1',
    source_handoff_fingerprint: kody.handoffs.sol.handoffFingerprint,
    witness_receipt_fingerprint: kody.handoffs.sol.witnessReceiptFingerprint,
    repository: kody.handoffs.sol.repository,
    branch: kody.handoffs.sol.branch,
    head_sha: kody.handoffs.sol.headSha,
    observed_at: kody.handoffs.sol.observedAt,
    expires_at: kody.handoffs.sol.expiresAt,
    lease_state: 'FRESH',
    continuity_state: 'FRESH',
    stale_witness_ids: [],
    duplicate_chain_count: 0,
    unique_evidence_chain_count: 0,
    drift_reasons: [],
  };
  return {
    service: 'solcontinuity-api',
    marker: {
      ...identity,
      continuity_fingerprint: fingerprint(identity),
      authority: AUTHORITY,
    },
    authority: 'none',
  };
}

function promptosResponse(kody: ReturnType<typeof kodyResponse>) {
  const workflowCore = {
    version: 1,
    schema: 'juss/promptos-court-workflow@v1',
    caseId: kody.handoffs.promptos.caseId,
    sourceHandoffFingerprint: kody.handoffs.promptos.handoffFingerprint,
    witnessReceiptFingerprint: kody.handoffs.promptos.witnessReceiptFingerprint,
    subject: {
      repository: kody.handoffs.promptos.repository,
      branch: kody.handoffs.promptos.branch,
      headSha: kody.handoffs.promptos.headSha,
    },
    observedAt: kody.handoffs.promptos.observedAt,
    expiresAt: kody.handoffs.promptos.expiresAt,
    state: 'COMPILED',
    founderGoal: kody.handoffs.promptos.founderGoal,
    stopCondition: kody.handoffs.promptos.stopCondition,
    sourceTask: kody.handoffs.promptos.task,
    constraints: kody.handoffs.promptos.constraints,
    steps: [{ id: 'return-court', action: 'return_to_court', purpose: 'return', mayMutate: false }],
    authority: AUTHORITY,
  };
  return {
    service: 'promptos',
    release_sha: 'd'.repeat(40),
    result: {
      ...workflowCore,
      workflowFingerprint: fingerprint(workflowCore),
    },
    authority: 'none',
  };
}

const CONFIG = {
  FCR_COURT_WITNESS_BRIDGE_ENABLED: '1',
  FCR_KODY_COURT_WITNESS_URL: 'https://kody.example/court',
  SOLCONTINUITY_COURT_URL: 'https://sol.example/api/court/continuity',
  SOLCONTINUITY_COURT_BRIDGE_TOKEN: 'sol-token',
  PROMPTOS_COURT_URL: 'https://promptos.example/court/compile',
  PROMPTOS_COURT_BRIDGE_KEY: 'promptos-token',
} as NodeJS.ProcessEnv;

describe('Court witness bridge', () => {
  it('fails closed while disabled', async () => {
    const fetchImpl = vi.fn();
    const result = await dispatchCourtWitnessBridge(packet(), {
      env: { ...CONFIG, FCR_COURT_WITNESS_BRIDGE_ENABLED: '0' },
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.code).toBe('BRIDGE_DISABLED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when bindings are incomplete', async () => {
    const fetchImpl = vi.fn();
    const result = await dispatchCourtWitnessBridge(packet(), {
      env: { FCR_COURT_WITNESS_BRIDGE_ENABLED: '1' },
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.code).toBe('BRIDGE_NOT_CONFIGURED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runs Kody -> Sol -> PromptOS with exact evidence bindings and no authority', async () => {
    const kody = kodyResponse();
    const sol = solResponse(kody);
    const promptos = promptosResponse(kody);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.startsWith('https://kody.example/')) {
        expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
        return new Response(JSON.stringify(kody), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (target.startsWith('https://sol.example/')) {
        expect(init?.headers).toEqual({
          'Content-Type': 'application/json',
          Authorization: 'Bearer sol-token',
        });
        return new Response(JSON.stringify(sol), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      expect(init?.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer promptos-token',
      });
      return new Response(JSON.stringify(promptos), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await dispatchCourtWitnessBridge(packet(), {
      env: CONFIG,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.code).toBe('COMPLETE');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect((result.kody?.authority as JsonRecord).executionAuthorized).toBe(false);
    expect(((result.sol?.marker as JsonRecord).authority as JsonRecord).createsAuthority).toBe(false);
    expect(((result.promptos?.result as JsonRecord).authority as JsonRecord).publishAuthorized).toBe(false);
  });

  it('rejects a tampered Kody handoff before calling Sol or PromptOS', async () => {
    const kody = kodyResponse();
    kody.handoffs.sol.branch = 'tampered';
    const fetchImpl = vi.fn(async () => (
      new Response(JSON.stringify(kody), { status: 200, headers: { 'content-type': 'application/json' } })
    ));

    const result = await dispatchCourtWitnessBridge(packet(), {
      env: CONFIG,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.code).toBe('KODY_RECEIPT_INVALID');
    expect(result.reasons.join(' ')).toMatch(/fingerprint mismatch/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops when Sol binds its marker to another subject', async () => {
    const kody = kodyResponse();
    const sol = solResponse(kody);
    sol.marker.head_sha = 'f'.repeat(40);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.startsWith('https://kody.example/')) {
        return new Response(JSON.stringify(kody), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify(sol), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await dispatchCourtWitnessBridge(packet(), {
      env: CONFIG,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.code).toBe('SOL_RECEIPT_INVALID');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stops when PromptOS binds its workflow to another handoff', async () => {
    const kody = kodyResponse();
    const sol = solResponse(kody);
    const promptos = promptosResponse(kody);
    promptos.result.sourceHandoffFingerprint = '9'.repeat(64);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.startsWith('https://kody.example/')) {
        return new Response(JSON.stringify(kody), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (target.startsWith('https://sol.example/')) {
        return new Response(JSON.stringify(sol), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify(promptos), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await dispatchCourtWitnessBridge(packet(), {
      env: CONFIG,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.code).toBe('PROMPTOS_RECEIPT_INVALID');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects Kody lease tampering before downstream calls', async () => {
    const kody = kodyResponse({
      ...packet(),
      expiresAt: '2026-10-06T09:00:00Z',
    });

    const fetchImpl = vi.fn(async () => (
      new Response(JSON.stringify(kody), { status: 200, headers: { 'content-type': 'application/json' } })
    ));

    const result = await dispatchCourtWitnessBridge(packet(), {
      env: CONFIG,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.code).toBe('KODY_RECEIPT_INVALID');
    expect(result.reasons.join(' ')).toMatch(/expiresAt does not match request/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('preserves an opaque upstream HTTP rejection instead of calling it unreachable', async () => {
    const fetchImpl = vi.fn(async () => (
      new Response('denied', { status: 403, headers: { 'content-type': 'text/plain' } })
    ));

    const result = await dispatchCourtWitnessBridge(packet(), {
      env: CONFIG,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.code).toBe('KODY_REJECTED');
    expect(result.reasons).toContain('Kody rejected Court witness with HTTP 403');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

});
