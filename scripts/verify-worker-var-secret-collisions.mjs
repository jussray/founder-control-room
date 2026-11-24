#!/usr/bin/env node
/**
 * Worker [vars] / secret name-collision preflight.
 *
 * A name declared as a plain-text `[vars]` binding in wrangler.worker.toml must
 * not also exist as a Worker secret. When it does, the first canonical
 * `wrangler deploy` either fails or leaves the runtime binding ambiguous, so the
 * production deploy path must stop before any provider mutation.
 *
 * Two checks, both name-only (values are never read, parsed, or printed):
 *   1. static/offline: a name in both `[vars]` and `[secrets].required|optional`;
 *   2. live: a `[vars]` name present in a `wrangler secret list --format json`
 *      receipt supplied by the caller (this script never calls Cloudflare).
 *
 * Usage:
 *   node scripts/verify-worker-var-secret-collisions.mjs [--config wrangler.worker.toml] [--secret-receipt <path>]
 * Exit 0 when no collision; exit 1 on any collision or unreadable input.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TABLE_HEADER = /^\s*(\[\[?)\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/;
const BARE_OR_QUOTED_KEY = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*=/;

function stripComment(line) {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\' && inDouble) { i += 1; continue; }
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '#' && !inDouble && !inSingle) return line.slice(0, i);
  }
  return line;
}

/**
 * Parse only the names this check needs from a wrangler TOML source:
 * top-level `[vars]` keys and top-level `[secrets].required` / `.optional`
 * string arrays. Values of `[vars]` are ignored.
 */
export function parseWorkerConfigNames(tomlText) {
  if (typeof tomlText !== 'string') throw new TypeError('toml-source-not-string');
  const vars = [];
  const secrets = { required: [], optional: [] };
  const lines = tomlText.split(/\r?\n/);
  let table = '';
  let arrayTarget = null;
  let arrayBuffer = '';

  const flushArray = () => {
    const names = [...arrayBuffer.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
    secrets[arrayTarget].push(...names);
    arrayTarget = null;
    arrayBuffer = '';
  };

  for (const rawLine of lines) {
    const line = stripComment(rawLine);
    if (arrayTarget) {
      arrayBuffer += `\n${line}`;
      if (line.includes(']')) flushArray();
      continue;
    }
    if (!line.trim()) continue;
    const header = line.match(TABLE_HEADER);
    if (header && !BARE_OR_QUOTED_KEY.test(line)) {
      table = header[1] === '[[' ? `[[${header[2]}]]` : header[2];
      continue;
    }
    const key = line.match(BARE_OR_QUOTED_KEY);
    if (!key) continue;
    const name = key[1] ?? key[2] ?? key[3];
    if (table === 'vars') {
      vars.push(name);
    } else if (table === 'secrets' && (name === 'required' || name === 'optional')) {
      const rest = line.slice(line.indexOf('=') + 1);
      if (!rest.includes('[')) throw new Error(`secrets-${name}-not-array`);
      arrayTarget = name;
      arrayBuffer = rest;
      if (rest.includes(']')) flushArray();
    }
  }
  if (arrayTarget) throw new Error(`secrets-${arrayTarget}-array-unterminated`);
  return { vars, secrets };
}

/** Names declared in both `[vars]` and the `[secrets]` registries. Pure. */
export function findStaticVarSecretCollisions({ vars, secrets }) {
  const registry = new Set([...(secrets?.required ?? []), ...(secrets?.optional ?? [])]);
  return [...new Set(vars)].filter((name) => registry.has(name)).sort();
}

/** `[vars]` names that already exist as provider-held Worker secrets. Pure. */
export function findProviderVarSecretCollisions(varNames, secretNames) {
  const provider = new Set(secretNames);
  return [...new Set(varNames)].filter((name) => provider.has(name)).sort();
}

/**
 * Extract secret names from a `wrangler secret list --format json` receipt.
 * Wrangler may surround the JSON array with notices that themselves contain
 * brackets ("▲ [WARNING] ..."), so the first span that decodes to an array of
 * name-bearing objects is used. Fails closed on anything else.
 */
export function parseSecretListReceipt(receiptText) {
  if (typeof receiptText !== 'string') throw new Error('secret-receipt-invalid');
  const isNameList = (value) => Array.isArray(value)
    && value.every((entry) => entry && typeof entry === 'object' && typeof entry.name === 'string' && entry.name);
  for (let start = receiptText.indexOf('['); start !== -1; start = receiptText.indexOf('[', start + 1)) {
    for (let end = receiptText.lastIndexOf(']'); end > start; end = receiptText.lastIndexOf(']', end - 1)) {
      let candidate;
      try {
        candidate = JSON.parse(receiptText.slice(start, end + 1));
      } catch {
        continue;
      }
      if (isNameList(candidate)) return candidate.map((entry) => entry.name);
    }
  }
  throw new Error('secret-receipt-invalid');
}

/** Full evaluation; returns a name-only result, never values. */
export function evaluateVarSecretCollisions({ tomlText, secretReceiptText = null }) {
  const config = parseWorkerConfigNames(tomlText);
  const staticCollisions = findStaticVarSecretCollisions(config);
  const providerCollisions = secretReceiptText === null
    ? null
    : findProviderVarSecretCollisions(config.vars, parseSecretListReceipt(secretReceiptText));
  return {
    ok: staticCollisions.length === 0 && (providerCollisions === null || providerCollisions.length === 0),
    varCount: config.vars.length,
    staticCollisions,
    providerCollisions,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`missing-value-for-${flag.slice(2)}`);
  return value;
}

export function main(argv = process.argv.slice(2), { log = console.log, error = console.error } = {}) {
  let result;
  try {
    const configPath = argValue(argv, '--config') ?? 'wrangler.worker.toml';
    const receiptPath = argValue(argv, '--secret-receipt');
    result = evaluateVarSecretCollisions({
      tomlText: readFileSync(configPath, 'utf8'),
      secretReceiptText: receiptPath ? readFileSync(receiptPath, 'utf8') : null,
    });
  } catch (cause) {
    const code = cause instanceof Error && /^[a-z0-9-]+$/.test(cause.message) ? cause.message : 'collision-preflight-failed';
    error(`::error title=Worker var/secret collision preflight failed::${code}`);
    return 1;
  }
  for (const name of result.staticCollisions) {
    error(`::error title=Worker var/secret registry collision::${name} is declared in both [vars] and [secrets] of wrangler.worker.toml. Keep each name in exactly one place.`);
  }
  for (const name of result.providerCollisions ?? []) {
    error(`::error title=Worker var/secret provider collision::${name} is a plain [vars] binding in wrangler.worker.toml but already exists as a Worker secret. Remove the secret or the var (founder decision) before deploying.`);
  }
  if (!result.ok) {
    const names = [...new Set([...result.staticCollisions, ...(result.providerCollisions ?? [])])];
    error(`Worker var/secret name collision: ${names.join(', ')}. Deployment stopped before provider mutation; no values were read.`);
    return 1;
  }
  log(
    `Worker var/secret collision preflight passed: ${result.varCount} [vars] names checked against the [secrets] registry`
    + (result.providerCollisions === null ? ' (static only; no provider receipt supplied)' : ' and the provider secret-name receipt')
    + '; values were not read.',
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
