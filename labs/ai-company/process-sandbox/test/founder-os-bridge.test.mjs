import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFounderOsWorkerRequest,
  executeFounderOsContainerTask,
  sealFounderOsContainerReceipt,
  stageFounderOsWorkspaceChange,
} from '../founder-os-bridge.mjs';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROOF = 'https://proof.example.test/founder-os-container-bridge';

function request(action = 'inspect') {
  return {
    goal: 'Inspect one synthetic Founder OS evidence path.',
    action,
    evidence: {
      repository: 'jussray/founder-control-room',
      commitSha: SHA,
      proofUrls: [PROOF],
    },
  };
}

function plan(action = 'inspect') {
  const commandId = action === 'plan' ? 'v10' : 'truthmode';
  const providerId = action === 'plan' ? 'chatgpt' : 'github';
  return {
    version: 'founder-os-lab-v1',
    goal: request(action).goal,
    action,
    readiness: 'ready_for_review',
    isolation: {
      externalCalls: false,
      providerCalls: false,
      databaseWrites: false,
      filesystemWrites: false,
      environmentReads: false,
    },
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
      approvalRequired: false,
      approvalObserved: false,
      capabilityPlanBound: false,
    },
    route: {
      chiefSkill: 'juss-chief-ai',
      command: {
        id: commandId,
        role: 'Synthetic command route.',
        class: action === 'plan' ? 'founder' : 'truth',
      },
      provider: {
        id: providerId,
        mode: 'preview',
        supported: true,
        executionAllowed: false,
        approvalRequired: false,
        credentialBoundary: 'connector-owned',
        evidenceRequired: [],
        preflightEvidenceRequired: [],
        preflightEvidenceObserved: [],
        preflightEvidenceMissing: [],
        rollback: 'Discard preview.',
      },
      project: null,
      capabilityPlan: {
        observed: false,
        valid: false,
        selectedBy: null,
        planHash: null,
        registryHash: null,
        capabilityIds: [],
        strategicLenses: [],
        outcomeSignals: [],
        errors: [],
      },
      capabilities: ['founder-routing', 'proof-validation'],
      adapters: [],
    },
    truth: {
      verified: ['Synthetic route only.'],
      inferred: [],
      unknown: [],
      blocked: [],
    },
    redteam: {
      shouldExist: true,
      premiseRisk: 'Synthetic fixture.',
      failureModes: [],
    },
    l99: {
      authority: 'L0 simulation only.',
      state: 'ready_for_review',
      evidence: 'Synthetic fixture.',
      rollback: 'Revert.',
      compoundingValue: 'Deterministic contract.',
    },
    ooda: {
      observe: [],
      orient: [],
      decide: [],
      act: [],
      verify: [],
      loop: [],
    },
    nextGate: 'Review.',
  };
}

function boundary() {
  return {
    type: 'docker-container',
    network: 'none',
    rootFilesystem: 'read-only',
    inheritedHostEnvironment: false,
    user: '65534:65534',
    capabilitiesDropped: 'ALL',
    noNewPrivileges: true,
    memory: '64m',
    memorySwap: '64m',
    cpus: '0.50',
    pids: '32',
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function workerFingerprint(value) {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function containerReceipt(workerRequest) {
  const receipt = {
    version: 'container-execution-receipt-v1',
    status: 'simulated',
    boundary: boundary(),
    exitCode: 0,
    signal: null,
    worker: {
      status: 'simulated',
      workerVersion: 'ai-company-process-worker-v1',
      environmentCleared: true,
      authority: {
        level: 'L0',
        mode: 'simulation',
        executionAllowed: false,
      },
      capabilities: {
        network: false,
        providers: false,
        database: false,
        filesystemWrite: false,
        childProcess: false,
        workerThreads: false,
        nativeAddons: false,
        wasi: false,
        inspector: false,
        dynamicCode: false,
        environment: false,
      },
      inputFingerprint: '1234abcd',
      outputFingerprint: '5678efab',
      result: {
        version: 'synthetic-employee-result-v1',
        taskId: workerRequest.taskId,
        employee: {
          id: 'synthetic-evidence-analyst',
          version: 'synthetic-evidence-analyst-v1',
          model: {
            provider: 'deterministic-fixture',
            id: 'synthetic-model-v1',
            externalCalls: false,
          },
        },
        authority: {
          level: 'L0',
          mode: 'simulation',
          executionAllowed: false,
        },
        decision: 'ready_for_review',
        goal: workerRequest.task.goal,
        audiences: ['founder-control-plane'],
        missingProof: [],
        brief: ['Synthetic evidence brief.'],
        liveSideEffects: false,
        publicUrl: null,
      },
    },
  };
  receipt.worker.inputFingerprint = workerFingerprint(workerRequest);
  receipt.worker.outputFingerprint = workerFingerprint(receipt.worker.result);
  return receipt;
}

test('builds deterministic worker requests only for inspect and plan', () => {
  for (const action of ['inspect', 'plan']) {
    const first = buildFounderOsWorkerRequest(request(action), plan(action));
    const second = buildFounderOsWorkerRequest(request(action), plan(action));

    assert.deepEqual(first, second);
    assert.equal(first.version, 'synthetic-employee-request-v1');
    assert.equal(first.dataClassification, 'synthetic');
    assert.equal(first.employee, 'synthetic-evidence-analyst');
    assert.match(first.taskId, /^founder-os-[0-9a-f]{8}$/);
    assert.equal(first.authority.level, 'L0');
    assert.equal(first.authority.executionAllowed, false);
    assert.equal(first.task.kind, 'evidence-brief');
    assert.deepEqual(first.task.audiences, ['founder-control-plane']);
    assert.ok(first.task.facts.length >= 5);
    assert.ok(first.task.facts.length <= 12);
    assert.ok(first.task.facts.every((fact) => fact.proofUrl.startsWith('https://')));
    assert.ok(Object.isFrozen(first));
  }
});

test('rejects mutating Founder OS actions before a container can run', async () => {
  for (const action of [
    'draft-social',
    'queue-social',
    'publish-social',
    'merge-code',
    'deploy-code',
    'send-email',
  ]) {
    const input = request(action);
    const candidate = plan(action);
    candidate.readiness = 'ready_for_external_executor';
    candidate.authority.approvalRequired = true;
    candidate.authority.approvalObserved = true;

    assert.throws(
      () => buildFounderOsWorkerRequest(input, candidate),
      /only inspect and plan may enter the container worker/,
    );

    const receipt = await executeFounderOsContainerTask(input, candidate);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.containerInvoked, false);
    assert.deepEqual(receipt.violations, ['action_not_allowlisted']);
    assert.equal(receipt.authority.executionAllowed, false);
  }
});

test('requires complete exact-head evidence before worker handoff', () => {
  const missingRepository = request();
  delete missingRepository.evidence.repository;
  assert.throws(
    () => buildFounderOsWorkerRequest(missingRepository, plan()),
    /authoritative repository is required/,
  );

  const shortSha = request();
  shortSha.evidence.commitSha = 'abc123';
  assert.throws(
    () => buildFounderOsWorkerRequest(shortSha, plan()),
    /40-character commit SHA/,
  );

  const badProof = request();
  badProof.evidence.proofUrls = ['http://proof.example.test/not-https'];
  assert.throws(
    () => buildFounderOsWorkerRequest(badProof, plan()),
    /HTTPS proof URLs/,
  );
});

test('requires an exact L0 ready-for-review Founder OS plan', () => {
  const mismatch = plan();
  mismatch.action = 'plan';
  assert.throws(
    () => buildFounderOsWorkerRequest(request(), mismatch),
    /plan does not match/,
  );

  const authority = plan();
  authority.authority.executionAllowed = true;
  assert.throws(
    () => buildFounderOsWorkerRequest(request(), authority),
    /authority must remain L0/,
  );

  const blocked = plan();
  blocked.truth.blocked.push('synthetic blocker');
  assert.throws(
    () => buildFounderOsWorkerRequest(request(), blocked),
    /blocked Founder OS plans/,
  );

  const provider = plan();
  provider.route.provider.executionAllowed = true;
  assert.throws(
    () => buildFounderOsWorkerRequest(request(), provider),
    /provider must remain a supported non-executing preview/,
  );

  const preflight = plan();
  preflight.route.provider.preflightEvidenceMissing = ['commitSha'];
  assert.throws(
    () => buildFounderOsWorkerRequest(request(), preflight),
    /preflight evidence must be complete/,
  );

  const approvalState = plan();
  approvalState.authority.approvalRequired = true;
  assert.throws(
    () => buildFounderOsWorkerRequest(request(), approvalState),
    /must never require approval/,
  );
});

test('seals a verified container result into a Chief AI control-plane receipt', () => {
  const input = request();
  const candidate = plan();
  const workerRequest = buildFounderOsWorkerRequest(input, candidate);
  const raw = containerReceipt(workerRequest);

  const first = sealFounderOsContainerReceipt(workerRequest, candidate, raw);
  const second = sealFounderOsContainerReceipt(workerRequest, candidate, raw);

  assert.deepEqual(first, second);
  assert.equal(first.status, 'simulated');
  assert.equal(first.controlPlane, 'juss-chief-ai');
  assert.equal(first.founderOs.action, 'inspect');
  assert.equal(first.founderOs.commandId, 'truthmode');
  assert.equal(first.founderOs.providerId, 'github');
  assert.equal(first.authority.level, 'L0');
  assert.equal(first.authority.executionAllowed, false);
  assert.equal(first.containerInvoked, true);
  assert.equal(first.container.boundary.network, 'none');
  assert.equal(first.employee.id, 'synthetic-evidence-analyst');
  assert.equal(first.employee.decision, 'ready_for_review');
  assert.equal(first.liveSideEffects, false);
  assert.equal(first.publicUrl, null);
  assert.match(first.receiptFingerprint, /^[0-9a-f]{8}$/);
  assert.ok(Object.isFrozen(first));
});

test('rejects forged boundary, authority, task, and model claims', () => {
  const input = request();
  const candidate = plan();
  const workerRequest = buildFounderOsWorkerRequest(input, candidate);

  const forgeries = [
    (receipt) => { receipt.boundary.network = 'host'; },
    (receipt) => { receipt.worker.authority.executionAllowed = true; },
    (receipt) => { receipt.worker.workerVersion = 'unexpected-worker-v2'; },
    (receipt) => { receipt.worker.capabilities = {}; },
    (receipt) => { receipt.worker.inputFingerprint = 'not-a-fingerprint'; },
    (receipt) => { receipt.worker.result.version = 'unexpected-result-v2'; },
    (receipt) => { receipt.worker.result.taskId = 'different-task'; },
    (receipt) => { receipt.worker.result.employee.version = 'unexpected-employee-v2'; },
    (receipt) => { receipt.worker.result.employee.model.id = 'unexpected-model-v2'; },
    (receipt) => { receipt.worker.result.employee.model.externalCalls = true; },
    (receipt) => { receipt.worker.result.missingProof = ['forged gap']; },
    (receipt) => { receipt.worker.result.decision = 'published'; },
    (receipt) => { receipt.worker.result.publicUrl = 'https://public.example.test/forged'; },
  ];

  for (const forge of forgeries) {
    const raw = containerReceipt(workerRequest);
    forge(raw);
    const sealed = sealFounderOsContainerReceipt(workerRequest, candidate, raw);

    assert.equal(sealed.status, 'blocked');
    assert.equal(sealed.authority.executionAllowed, false);
    assert.ok(sealed.violations.length > 0);
    assert.equal(sealed.receiptFingerprint, null);
    assert.equal(sealed.employee, null);
  }
});


test('rejects plausible hex fingerprints if they do not bind to the actual request and result', () => {
  const input = request();
  const candidate = plan();
  const workerRequest = buildFounderOsWorkerRequest(input, candidate);
  const badReceipts = [
    (raw) => { raw.worker.inputFingerprint = '00000000'; },
    (raw) => { raw.worker.outputFingerprint = '00000000'; },
    (raw) => { raw.worker.result.brief = ['Modified after the worker fingerprint was produced.']; },
  ];

  for (const tamper of badReceipts) {
    const raw = containerReceipt(workerRequest);
    tamper(raw);
    const sealed = sealFounderOsContainerReceipt(workerRequest, candidate, raw);
    assert.equal(sealed.status, 'blocked');
    assert.ok(sealed.violations.includes('worker_receipt_invalid'));
    assert.equal(sealed.receiptFingerprint, null);
    assert.equal(sealed.employee, null);
  }
});

test('propagates blocked container state only as a blocked control receipt', () => {
  const candidate = plan();
  const workerRequest = buildFounderOsWorkerRequest(request(), candidate);
  const raw = {
    version: 'container-execution-receipt-v1',
    status: 'blocked',
    violations: ['hard_deadline_exceeded'],
    worker: null,
  };

  const sealed = sealFounderOsContainerReceipt(workerRequest, candidate, raw);

  assert.equal(sealed.status, 'blocked');
  assert.equal(sealed.controlPlane, 'juss-chief-ai');
  assert.equal(sealed.containerInvoked, true);
  assert.ok(sealed.violations.includes('container_not_simulated'));
  assert.ok(sealed.violations.includes('container:hard_deadline_exceeded'));
  assert.equal(sealed.liveSideEffects, false);
  assert.equal(sealed.publicUrl, null);
});


test('Founder OS plan can actually edit synthetic source in memory and export governed receipt', () => {
  const input = request('plan');
  const candidate = plan('plan');
  const original = 'export const ready = false;\\n';
  const workspace = {
    dataClassification: 'synthetic',
    repository: input.evidence.repository,
    sourceSha: input.evidence.commitSha,
    branch: 'feat/founder-os-container-bridge',
    files: [{ path: 'src/fixture.ts', content: original }],
    edits: [{ path: 'src/fixture.ts', find: 'false', replace: 'true' }],
  };
  const result = stageFounderOsWorkspaceChange(input, candidate, workspace);
  assert.equal(result.artifacts[0].content, 'export const ready = true;\\n');
  assert.equal(workspace.files[0].content, original);
  assert.equal(result.receipt.controlPlane, 'juss-chief-ai');
  assert.equal(result.receipt.mode, 'in-memory-only');
  assert.equal(result.receipt.sourceBranchWrites, false);
  assert.equal(result.receipt.externalExecutionAllowed, false);
  assert.match(result.receipt.changes[0].afterSha256, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(result.receipt).includes('export const'));
});

test('virtual editing blocks mismatched exact head and unapproved action classes', () => {
  const input = request('plan');
  const candidate = plan('plan');
  const workspace = {
    dataClassification: 'synthetic',
    repository: input.evidence.repository,
    sourceSha: 'b'.repeat(40),
    branch: 'feat/founder-os-container-bridge',
    files: [{ path: 'src/fixture.ts', content: 'old' }],
    edits: [{ path: 'src/fixture.ts', find: 'old', replace: 'new' }],
  };
  assert.throws(
    () => stageFounderOsWorkspaceChange(input, candidate, workspace),
    /exact Founder OS source identity/,
  );
  workspace.sourceSha = input.evidence.commitSha;
  assert.throws(
    () => stageFounderOsWorkspaceChange(request('merge-code'), plan('merge-code'), workspace),
    /only inspect and plan may enter the container worker/,
  );
  assert.throws(
    () => stageFounderOsWorkspaceChange(request('inspect'), plan('inspect'), workspace),
    /virtual editing requires a Founder OS plan/,
  );
});
