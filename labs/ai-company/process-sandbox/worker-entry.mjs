import { runSyntheticEmployee } from './employee.mjs';

const MAX_INPUT_BYTES = 32 * 1024;
const WORKER_VERSION = 'ai-company-process-worker-v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
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

function fingerprint(value) {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function clearEnvironment() {
  for (const key of Object.keys(process.env)) delete process.env[key];
  return Object.keys(process.env).length === 0;
}

function disableAmbientNetworkGlobals() {
  for (const key of ['fetch', 'WebSocket', 'EventSource']) {
    if (key in globalThis) {
      Object.defineProperty(globalThis, key, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: undefined,
      });
    }
  }
}

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(deepFreeze(payload))}\n`, () => {
    process.exitCode = exitCode;
  });
}

const environmentCleared = clearEnvironment();
disableAmbientNetworkGlobals();

let input = '';
let inputBytes = 0;
let rejected = false;

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (rejected) return;
  inputBytes += Buffer.byteLength(chunk, 'utf8');
  if (inputBytes > MAX_INPUT_BYTES) {
    rejected = true;
    emit({
      status: 'blocked',
      workerVersion: WORKER_VERSION,
      violations: ['input_too_large'],
      environmentCleared,
      result: null,
    }, 2);
    process.stdin.destroy();
    return;
  }
  input += chunk;
});

process.stdin.on('end', () => {
  if (rejected) return;

  try {
    const request = JSON.parse(input);
    const result = runSyntheticEmployee(request);
    emit({
      status: 'simulated',
      workerVersion: WORKER_VERSION,
      environmentCleared,
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
      inputFingerprint: fingerprint(request),
      outputFingerprint: fingerprint(result),
      result,
    });
  } catch {
    emit({
      status: 'blocked',
      workerVersion: WORKER_VERSION,
      violations: ['worker_input_rejected'],
      environmentCleared,
      result: null,
    }, 2);
  }
});

process.stdin.resume();
