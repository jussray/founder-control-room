import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const read = (path) => readFile(join(root, path), 'utf8');

test('keeps the Sandbox SDK configuration isolated and version-aligned', async () => {
  const [configText, packageText, dockerfile] = await Promise.all([
    read('wrangler.jsonc'),
    read('package.json'),
    read('Dockerfile'),
  ]);
  const config = JSON.parse(configText);
  const pkg = JSON.parse(packageText);

  assert.equal(config.workers_dev, false);
  assert.equal('routes' in config, false);
  assert.deepEqual(config.containers, [{
    class_name: 'Sandbox',
    image: './Dockerfile',
    instance_type: 'lite',
    max_instances: 1,
  }]);
  assert.deepEqual(config.durable_objects.bindings.map((binding) => binding.class_name), [
    'Sandbox',
    'SandboxRequestGate',
  ]);
  assert.deepEqual(config.migrations, [{
    tag: 'v1',
    new_sqlite_classes: ['Sandbox', 'SandboxRequestGate'],
  }]);
  const sdkVersion = pkg.dependencies['@cloudflare/sandbox'];
  assert.match(sdkVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(
    dockerfile.trim(),
    `FROM docker.io/cloudflare/sandbox:${sdkVersion}-python`,
  );
});

test('keeps request data out of commands and destroys every ephemeral sandbox', async () => {
  const source = await read('src/index.ts');
  assert.match(source, /authenticateInvocation\(request, env\.SANDBOX_RUNNER_HMAC_KEY\)/);
  assert.match(source, /export class Sandbox extends SandboxBase\s*\{\s*enableInternet = false;/);
  assert.match(source, /getSandbox\(env\.Sandbox, await deriveSandboxSessionId\(invocation\)\)/);
  assert.match(source, /sandbox\.exec\(SYNTHETIC_EVIDENCE_COMMAND\)/);
  assert.match(source, /finally\s*\{/);
  assert.match(source, /await sandbox\.destroy\(\)/);
  assert.doesNotMatch(source, /request\.json\(|request\.text\(|url\.searchParams|allowedHosts|deniedHosts|ContainerProxy|outbound|sandbox\.(?:writeFile|startProcess|exposePort|terminal|wsConnect)|await\s+fetch\s*\(/);
});
