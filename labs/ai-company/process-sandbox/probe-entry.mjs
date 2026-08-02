import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { Worker } from 'node:worker_threads';

function denied(operation) {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}

function networkDenied() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const socket = createConnection({ host: '1.1.1.1', port: 53 });
    socket.once('connect', () => {
      socket.destroy();
      finish(false);
    });
    socket.once('error', () => finish(true));
    socket.setTimeout(500, () => {
      socket.destroy();
      finish(true);
    });
  });
}

const fsWriteDenied = denied(() => writeFileSync('/sandbox/escape.txt', 'blocked'));
const childProcessDenied = denied(() => spawnSync(process.execPath, ['-e', 'process.exit(0)']));
const workerThreadsDenied = denied(() => {
  const worker = new Worker('process.exit(0)', { eval: true });
  worker.terminate();
});
const result = {
  version: 'container-isolation-probe-v1',
  uidIsNonRoot: typeof process.getuid === 'function' ? process.getuid() !== 0 : true,
  hostSecretAbsent: process.env.SYNTHETIC_HOST_SECRET === undefined,
  fsWriteDenied,
  childProcessDenied,
  workerThreadsDenied,
  networkDenied: await networkDenied(),
  permissions: {
    fsWrite: process.permission?.has('fs.write') ?? null,
    child: process.permission?.has('child') ?? null,
    worker: process.permission?.has('worker') ?? null,
  },
};

process.stdout.write(`${JSON.stringify(result)}\n`);
