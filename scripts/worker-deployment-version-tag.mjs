#!/usr/bin/env node
/**
 * Post-deploy Worker version-tag readback.
 *
 * The production Deploy workflow passes `--tag <exact approved 40-char SHA>`
 * to `wrangler deploy`. This script proves, from provider readback only, that
 * the Worker's newest deployment routes 100% of traffic to exactly one version
 * and that version carries `annotations["workers/tag"]` equal to that SHA.
 *
 * Inputs are the JSON outputs of:
 *   wrangler deployments list --json
 *   wrangler versions view <version-id> --json
 *
 * It reads names/ids/annotations only. It never reads secret values, never
 * calls Cloudflare itself, and fails closed on any ambiguity.
 *
 * Usage:
 *   node scripts/worker-deployment-version-tag.mjs active-version <deployments.json>
 *   node scripts/worker-deployment-version-tag.mjs verify <deployments.json> <version.json> <expected-sha>
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const EXACT_SHA = /^[0-9a-f]{40}$/;
export const VERSION_TAG_ANNOTATION = 'workers/tag';

/**
 * wrangler may print human progress lines ahead of JSON output (observed for
 * `secret list` with env-var token auth). Extract the outermost JSON value.
 */
export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('wrangler output is not text');
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  // Progress lines can themselves contain brackets (e.g. "[WARNING]"), so try
  // each line-leading candidate start until one parses as a complete value.
  for (let index = 0; index < text.length && index < end; index += 1) {
    const char = text[index];
    if (char !== '[' && char !== '{') continue;
    if (index > 0 && text[index - 1] !== '\n') continue;
    try {
      return JSON.parse(text.slice(index, end + 1));
    } catch {
      // keep scanning
    }
  }
  throw new Error('wrangler output contains no complete JSON value');
}

/**
 * Select the newest deployment and require it to route 100% of traffic to a
 * single version. Returns that version id or throws.
 */
export function selectActiveVersionId(deployments) {
  if (!Array.isArray(deployments) || deployments.length === 0) {
    throw new Error('provider returned no Worker deployments');
  }
  const dated = deployments.filter(
    (deployment) =>
      deployment &&
      typeof deployment === 'object' &&
      typeof deployment.created_on === 'string' &&
      !Number.isNaN(Date.parse(deployment.created_on)),
  );
  if (dated.length !== deployments.length) {
    throw new Error('provider returned a deployment without a valid created_on');
  }
  const newest = [...dated].sort(
    (a, b) => Date.parse(b.created_on) - Date.parse(a.created_on),
  )[0];
  const versions = Array.isArray(newest.versions) ? newest.versions : [];
  if (versions.length !== 1) {
    throw new Error(
      `newest deployment routes traffic to ${versions.length} versions; exactly one is required`,
    );
  }
  const [only] = versions;
  if (!only || typeof only.version_id !== 'string' || only.version_id.length === 0) {
    throw new Error('newest deployment has no version_id');
  }
  if (only.percentage !== 100) {
    throw new Error(`newest deployment routes ${only.percentage}% to its version; 100% is required`);
  }
  return only.version_id;
}

/**
 * Pure comparison: does the active deployment's version carry the exact
 * expected SHA as its version tag?
 */
export function evaluateWorkerVersionTag({ deployments, version, expectedSha }) {
  const failures = [];
  let activeVersionId = null;
  let observedTag = null;

  if (typeof expectedSha !== 'string' || !EXACT_SHA.test(expectedSha)) {
    failures.push('expected SHA must be a lowercase 40-character commit SHA');
  }

  try {
    activeVersionId = selectActiveVersionId(deployments);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (!version || typeof version !== 'object' || Array.isArray(version)) {
    failures.push('provider returned no version object');
  } else {
    if (activeVersionId !== null && version.id !== activeVersionId) {
      failures.push('viewed version id does not match the active deployment version id');
    }
    const annotations =
      version.annotations && typeof version.annotations === 'object' ? version.annotations : {};
    const tag = annotations[VERSION_TAG_ANNOTATION];
    observedTag = typeof tag === 'string' ? tag : null;
    if (observedTag === null) {
      failures.push('active Worker version has no workers/tag annotation');
    } else if (observedTag !== expectedSha) {
      failures.push('active Worker version tag does not equal the exact expected SHA');
    }
  }

  return {
    ok: failures.length === 0,
    expectedSha: typeof expectedSha === 'string' ? expectedSha : null,
    activeVersionId,
    observedTag,
    failures,
  };
}

function readJsonFile(path) {
  return extractJson(readFileSync(path, 'utf8'));
}

function main(argv) {
  const [mode, ...rest] = argv;
  if (mode === 'active-version' && rest.length === 1) {
    process.stdout.write(`${selectActiveVersionId(readJsonFile(rest[0]))}\n`);
    return 0;
  }
  if (mode === 'verify' && rest.length === 3) {
    const [deploymentsPath, versionPath, expectedSha] = rest;
    const result = evaluateWorkerVersionTag({
      deployments: readJsonFile(deploymentsPath),
      version: readJsonFile(versionPath),
      expectedSha,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) {
      for (const failure of result.failures) {
        process.stderr.write(`::error title=Worker version tag readback failed::${failure}\n`);
      }
      return 1;
    }
    return 0;
  }
  process.stderr.write(
    'usage: worker-deployment-version-tag.mjs active-version <deployments.json> | verify <deployments.json> <version.json> <expected-sha>\n',
  );
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `::error title=Worker version tag readback failed::${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
