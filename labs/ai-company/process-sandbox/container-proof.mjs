import assert from 'node:assert/strict';
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

await buildContainerImage(DEFAULT_SANDBOX_IMAGE);

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
}));
