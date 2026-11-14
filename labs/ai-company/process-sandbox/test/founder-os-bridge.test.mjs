import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFounderOsWorkerRequest,
  executeFounderOsContainerTask,
  sealFounderOsContainerReceipt,
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
  const specialistSkill = action === 'plan' ? 'goalfix' : 'repo-truth';
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
    },
    route: {
      chiefSkill: 'juss-chief-ai',
      specialistSkill,
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

function containerReceipt(workerRequest) {
  return {
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

  const specialist = plan();
  specialist.route.specialistSkill = 'goalfix';
  assert.throws(
    () => buildFounderOsWorkerRequest(request(), specialist),
    /specialist does not match/,
  );

  const approvalState = plan();
  approvalState.authority.approvalObserved = true;
  assert.throws(
    () => buildFounderOsWorkerRequest(request(), approvalState),
    /must not depend on approval state/,
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
