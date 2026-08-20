import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../../../', import.meta.url);
const read = async (path) => readFile(new URL(path, root), 'utf8');
const SANDBOX_VERSION = '0.13.0-next.738.2';

test('Cloudflare Sandbox is a dormant portfolio execution substrate', async () => {
  const [configText, packageText, dockerfile, source, tsconfigText, productionWrangler] = await Promise.all([
    read('labs/ai-company/cloudflare-sandbox/wrangler.jsonc'),
    read('labs/ai-company/cloudflare-sandbox/package.json'),
    read('labs/ai-company/cloudflare-sandbox/Dockerfile'),
    read('labs/ai-company/cloudflare-sandbox/src/index.ts'),
    read('labs/ai-company/cloudflare-sandbox/tsconfig.json'),
    read('wrangler.worker.toml'),
  ]);

  const config = JSON.parse(configText);
  const pkg = JSON.parse(packageText);
  const tsconfig = JSON.parse(tsconfigText);

  assert.equal(config.name, 'founder-control-room-sandbox');
  assert.equal(config.tsconfig, './tsconfig.json');
  assert.equal(config.workers_dev, false);
  assert.equal(config.routes, undefined);
  assert.equal(config.containers?.length, 1);
  assert.equal(config.containers[0].class_name, 'InternalSandbox');
  assert.equal(config.containers[0].instance_type, 'lite');
  assert.equal(config.containers[0].max_instances, 1);
  assert.equal(config.durable_objects?.bindings?.[0]?.name, 'Sandbox');
  assert.deepEqual(config.migrations?.[0]?.new_sqlite_classes, ['InternalSandbox']);

  assert.equal(pkg.dependencies?.['@cloudflare/sandbox'], SANDBOX_VERSION);
  assert.match(
    dockerfile,
    new RegExp(`^FROM docker\\.io/cloudflare/sandbox:${SANDBOX_VERSION.replaceAll('.', '\\.')}\\s*$`, 'm'),
  );
  assert.equal(tsconfig.extends, undefined);
  assert.equal(tsconfig.compilerOptions?.noEmit, true);

  assert.match(source, /enableInternet\s*=\s*false/);
  assert.match(source, /genericExecutionEnabled:\s*false/);
  assert.match(source, /execution_authority_not_wired/);
  assert.match(source, /url\.pathname !== '\/v1\/probe'/);
  assert.doesNotMatch(source, /url\.pathname !== '\/v1\/exec'/);
  assert.match(source, /const PROBE_ARGV = Object\.freeze/);
  assert.doesNotMatch(source, /body\.argv|parseArgv|parseCwd/);
  assert.doesNotMatch(source, /proxyToSandbox|exposePort|tunnels\./);

  const authIndex = source.indexOf('if (!authorized(request, env))');
  const sandboxIndex = source.indexOf('const sandbox = getSandbox');
  assert.ok(authIndex >= 0 && sandboxIndex > authIndex, 'authentication must happen before sandbox allocation');
  assert.match(source, /sandbox\.destroy\(\)/);

  assert.doesNotMatch(productionWrangler, /founder-control-room-sandbox|InternalSandbox|containers/);
});

test('Cloudflare substrate preserves the existing local process-sandbox safety floor', async () => {
  const [host, workerEntry] = await Promise.all([
    read('labs/ai-company/process-sandbox/host.mjs'),
    read('labs/ai-company/process-sandbox/worker-entry.mjs'),
  ]);

  assert.match(host, /'--network',\s*'none'/);
  assert.match(host, /'--read-only'/);
  assert.match(host, /'--cap-drop',\s*'ALL'/);
  assert.match(host, /'no-new-privileges:true'/);
  assert.match(host, /inheritedHostEnvironment:\s*false/);
  assert.match(workerEntry, /executionAllowed:\s*false/);
  assert.match(workerEntry, /network:\s*false/);
  assert.match(workerEntry, /providers:\s*false/);
  assert.match(workerEntry, /database:\s*false/);
});
