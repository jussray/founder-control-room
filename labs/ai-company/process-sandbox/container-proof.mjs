import assert from 'node:assert/strict';
import {
  executeFounderOsContainerTask,
} from './founder-os-bridge.mjs';
import {
  DEFAULT_SANDBOX_IMAGE,
  buildContainerImage,
  runDeadlineProbe,
  runIsolationProbe,
  runSyntheticEmployeeContainer,
} from './host.mjs';

function request() {
  return {
    version: 'synthetic-employee-request-v1',
    dataClassification: 'synthetic',
    employee: 'synthetic-evidence-analyst',
    taskId: 'synthetic-container-task-001',
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
    },
    task: {
      kind: 'evidence-brief',
      goal: 'Prepare one deterministic container-isolated evidence brief.',
      audiences: ['founders', 'investors'],
      facts: [
        {
          label: 'Governance',
          value: 'The process has zero live authority and a hard deadline.',
          proofUrl: 'https://proof.example.test/container-governance',
        },
        {
          label: 'Traction',
          value: 'One synthetic employee completed a sealed task.',
          proofUrl: 'https://proof.example.test/container-traction',
        },
      ],
    },
  };
}

function founderOsRequest() {
  return {
    goal: 'Prepare one synthetic Founder OS evidence brief.',
    action: 'inspect',
    evidence: {
      repository: 'jussray/founder-control-room',
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      proofUrls: ['https://proof.example.test/founder-os-container-bridge'],
    },
  };
}

function founderOsPlan() {
  return {
    version: 'founder-os-lab-v1',
    goal: founderOsRequest().goal,
    action: 'inspect',
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
        id: 'truthmode',
        role: 'Separate verified, inferred, unknown, and blocked claims.',
        class: 'truth',
      },
      provider: {
        id: 'github',
        mode: 'preview',
        supported: true,
        executionAllowed: false,
        approvalRequired: false,
        credentialBoundary: 'connector-owned',
        evidenceRequired: ['repository', 'base branch', 'candidate head SHA', 'checks', 'review threads'],
        preflightEvidenceRequired: ['repository', 'commitSha', 'proofUrls'],
        preflightEvidenceObserved: ['repository', 'commitSha', 'proofUrls'],
        preflightEvidenceMissing: [],
        rollback: 'Discard the preview; no repository reference is changed.',
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
      capabilities: ['founder-routing', 'repository-inspection', 'proof-validation'],
      adapters: ['repository-preview'],
    },
    truth: {
      verified: ['Synthetic container bridge proof.'],
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
      compoundingValue: 'Deterministic bridge proof.',
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

await buildContainerImage(DEFAULT_SANDBOX_IMAGE);

const founderBridgeFirst = await executeFounderOsContainerTask(
  founderOsRequest(),
  founderOsPlan(),
  {
    image: DEFAULT_SANDBOX_IMAGE,
    hostEnvironment: { SYNTHETIC_HOST_SECRET: 'must-not-enter-container' },
  },
);
const founderBridgeSecond = await executeFounderOsContainerTask(
  founderOsRequest(),
  founderOsPlan(),
  {
    image: DEFAULT_SANDBOX_IMAGE,
    hostEnvironment: { SYNTHETIC_HOST_SECRET: 'must-not-enter-container' },
  },
);

assert.equal(founderBridgeFirst.status, 'simulated');
assert.equal(founderBridgeFirst.controlPlane, 'juss-chief-ai');
assert.equal(founderBridgeFirst.authority.level, 'L0');
assert.equal(founderBridgeFirst.authority.executionAllowed, false);
assert.equal(founderBridgeFirst.containerInvoked, true);
assert.equal(founderBridgeFirst.container.boundary.network, 'none');
assert.equal(founderBridgeFirst.employee.id, 'synthetic-evidence-analyst');
assert.equal(founderBridgeFirst.employee.decision, 'ready_for_review');
assert.equal(founderBridgeFirst.liveSideEffects, false);
assert.equal(founderBridgeFirst.publicUrl, null);
assert.equal(founderBridgeFirst.receiptFingerprint, founderBridgeSecond.receiptFingerprint);
assert.deepEqual(founderBridgeFirst.employee.brief, founderBridgeSecond.employee.brief);

const first = await runSyntheticEmployeeContainer(request(), {
  image: DEFAULT_SANDBOX_IMAGE,
  hostEnvironment: { SYNTHETIC_HOST_SECRET: 'must-not-enter-container' },
});
const second = await runSyntheticEmployeeContainer(request(), {
  image: DEFAULT_SANDBOX_IMAGE,
  hostEnvironment: { SYNTHETIC_HOST_SECRET: 'must-not-enter-container' },
});

assert.equal(first.status, 'simulated');
assert.equal(first.exitCode, 0);
assert.deepEqual(first.worker, second.worker);
assert.equal(first.worker.environmentCleared, true);
assert.equal(first.worker.authority.level, 'L0');
assert.equal(first.worker.authority.executionAllowed, false);
assert.ok(Object.values(first.worker.capabilities).every((value) => value === false));
assert.equal(first.worker.inputFingerprint, second.worker.inputFingerprint);
assert.equal(first.worker.outputFingerprint, second.worker.outputFingerprint);
assert.equal(first.worker.result.employee.model.externalCalls, false);
assert.equal(first.worker.result.liveSideEffects, false);
assert.equal(first.worker.result.publicUrl, null);
assert.deepEqual(first.boundary, {
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
});

const malformed = request();
malformed.task.kind = 'shell-command';
const rejected = await runSyntheticEmployeeContainer(malformed, {
  image: DEFAULT_SANDBOX_IMAGE,
});
assert.equal(rejected.status, 'blocked');
assert.deepEqual(rejected.worker.violations, ['worker_input_rejected']);
assert.equal(rejected.worker.result, null);

const probe = await runIsolationProbe({ image: DEFAULT_SANDBOX_IMAGE });
assert.equal(probe.uidIsNonRoot, true);
assert.equal(probe.hostSecretAbsent, true);
assert.equal(probe.fsWriteDenied, true);
assert.equal(probe.childProcessDenied, true);
assert.equal(probe.workerThreadsDenied, true);
assert.equal(probe.networkDenied, true);
assert.equal(probe.permissions.fsWrite, false);
assert.equal(probe.permissions.child, false);
assert.equal(probe.permissions.worker, false);

const deadline = await runDeadlineProbe({
  image: DEFAULT_SANDBOX_IMAGE,
  timeoutMs: 250,
});
assert.equal(deadline.timedOut, true);
assert.equal(deadline.signal, 'SIGKILL');

console.log(JSON.stringify({
  status: 'passed',
  image: DEFAULT_SANDBOX_IMAGE,
  deterministicWorker: true,
  runtimeIsolation: probe,
  hardDeadline: deadline,
  founderOsBridge: {
    status: founderBridgeFirst.status,
    controlPlane: founderBridgeFirst.controlPlane,
    receiptFingerprint: founderBridgeFirst.receiptFingerprint,
  },
}));
