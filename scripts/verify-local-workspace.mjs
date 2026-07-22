import {access, readdir, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';
import {spawn} from 'node:child_process';

const expected = [
  {
    slug: 'founder-control-room',
    directory: 'founder-control-room',
    remote: 'jussray/founder-control-room',
    allowDirty: false,
  },
  {
    slug: 'juss-beautiful-hair-private',
    directory: 'jbh-private',
    remote: 'jussray/jbh-private',
    head: 'a77bdcd4314eb9753da6354ffd35d17df5ba6927',
    allowDirty: false,
  },
  {
    slug: 'juss-beautiful-hair',
    directory: 'jussbeautifulhair-site',
    remote: 'jussray/jussbeautifulhair-site',
    head: '9444483d63d1d10823b80323f3b4c796b444be0c',
    allowDirty: false,
  },
  {
    slug: 'untold-stories',
    directory: 'untold-stories-storefront',
    remote: 'jussray/untold-stories-storefront',
    head: 'eb23d6e364a483b28e0ea8d6577d050b293b9930',
    allowDirty: false,
  },
];

function printUsage() {
  console.error('Usage: CONTROL_ROOM_WORKSPACE_ROOT=/absolute/workspace node scripts/verify-local-workspace.mjs');
}

function runGit(cwd, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('git', args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectRun);
    child.on('close', (code, signal) => {
      resolveRun({code, signal, stdout: stdout.trim(), stderr: stderr.trim()});
    });
  });
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && rel !== '..' && !rel.startsWith(`..${sep}`) && !resolve(rel).startsWith(sep));
}

function containsOwnerRepo(remoteOutput, ownerRepo) {
  return remoteOutput.toLowerCase().includes(ownerRepo.toLowerCase());
}

const failures = [];
const warnings = [];

const rootInput = process.env.CONTROL_ROOM_WORKSPACE_ROOT;
if (!rootInput) {
  failures.push('CONTROL_ROOM_WORKSPACE_ROOT is not set.');
  printUsage();
} else if (!resolve(rootInput).startsWith(sep)) {
  failures.push('CONTROL_ROOM_WORKSPACE_ROOT must be an absolute path.');
}

let rootReal = null;
if (rootInput && failures.length === 0) {
  try {
    rootReal = await realpath(rootInput);
    await access(rootReal, constants.R_OK | constants.X_OK);
  } catch (error) {
    failures.push(`Workspace root is not readable/executable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (rootReal) {
  const entries = await readdir(rootReal, {withFileTypes: true});
  const publicRepoNestedPrivateNames = new Set(['jbh-private', 'jussbeautifulhair-site', 'untold-stories-storefront']);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (!expected.some((spec) => spec.directory === entry.name)) {
      warnings.push(`Unexpected workspace directory ignored: ${entry.name}`);
    }
  }

  for (const spec of expected) {
    const checkoutPath = join(rootReal, spec.directory);
    try {
      const checkoutReal = await realpath(checkoutPath);
      if (!isInside(rootReal, checkoutReal)) {
        failures.push(`${spec.slug}: checkout resolves outside CONTROL_ROOM_WORKSPACE_ROOT.`);
        continue;
      }
      await access(join(checkoutReal, '.git'), constants.R_OK);

      if (spec.directory === 'founder-control-room') {
        for (const privateName of publicRepoNestedPrivateNames) {
          try {
            await access(join(checkoutReal, privateName), constants.F_OK);
            failures.push(`founder-control-room: private checkout ${privateName} must not be nested inside the public Control Room repository.`);
          } catch {
            // Expected: private repos are siblings under the workspace root, not copied into FCR.
          }
        }
      }

      const topLevel = await runGit(checkoutReal, ['rev-parse', '--show-toplevel']);
      if (topLevel.code !== 0) {
        failures.push(`${spec.slug}: git top-level check failed: ${topLevel.stderr || topLevel.stdout}`);
        continue;
      }
      const topLevelReal = await realpath(topLevel.stdout);
      if (topLevelReal !== checkoutReal) {
        failures.push(`${spec.slug}: expected checkout root ${checkoutReal}, got Git top-level ${topLevelReal}.`);
      }

      const remote = await runGit(checkoutReal, ['remote', '-v']);
      if (remote.code !== 0 || !containsOwnerRepo(remote.stdout, spec.remote)) {
        failures.push(`${spec.slug}: expected a git remote containing ${spec.remote}.`);
      }

      const head = await runGit(checkoutReal, ['rev-parse', 'HEAD']);
      if (head.code !== 0 || !/^[0-9a-f]{40}$/i.test(head.stdout)) {
        failures.push(`${spec.slug}: cannot read a full Git HEAD SHA.`);
      } else if (spec.head && head.stdout.toLowerCase() !== spec.head) {
        failures.push(`${spec.slug}: HEAD ${head.stdout} does not match mission SHA ${spec.head}.`);
      }

      const status = await runGit(checkoutReal, ['status', '--short']);
      if (status.code !== 0) {
        failures.push(`${spec.slug}: git status failed: ${status.stderr || status.stdout}`);
      } else if (!spec.allowDirty && status.stdout !== '') {
        failures.push(`${spec.slug}: working tree is dirty; exact-head terminal proof requires a clean checkout.`);
      }
    } catch (error) {
      failures.push(`${spec.slug}: missing or unreadable checkout at ${checkoutPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (warnings.length > 0) {
  console.warn('Local workspace preflight warnings:');
  for (const warning of warnings) console.warn(` - ${warning}`);
}

if (failures.length > 0) {
  console.error('Local workspace preflight failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Local workspace preflight passed.');
console.log('Reviewed checkouts are present, sibling-scoped, clean, and exact-head bound.');
