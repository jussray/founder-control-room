#!/usr/bin/env node
/**
 * Test discovery ratchet.
 *
 * This verifier treats the active Vitest test.include contract as a static,
 * fail-closed source of discovery semantics and treats the baseline only as
 * base-bound historical debt. A candidate may pay debt down, but it may not
 * grow the allowlist or hide tests by changing include/exclude semantics.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { posix } from 'node:path';

const BASELINE_PATH = 'scripts/test-discovery-baseline.json';
const VITEST_CONFIG_PATH = 'vitest.config.ts';
const CURRENT_INCLUDE_PATTERN = 'src/**/*.test.{ts,js}';
const LEGACY_BASE_INCLUDE_PATTERN = 'src/**/*.test.ts';
const CANDIDATE_TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i;

function fail(messages) {
  console.error('\nTest discovery contract FAILED:');
  for (const message of messages) console.error(`- ${message}`);
  console.error('');
  process.exit(1);
}

async function collectTestFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectTestFiles(full)));
    } else if (entry.isFile() && CANDIDATE_TEST_FILE.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function parseBaseline(text, source, { allowedIncludePatterns = [CURRENT_INCLUDE_PATTERN] } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail([`${source} is not valid JSON`, error instanceof Error ? error.message : String(error)]);
  }

  if (!allowedIncludePatterns.includes(parsed.includePattern)) {
    fail([
      `${source} must record an approved includePattern (${allowedIncludePatterns.map((pattern) => `'${pattern}'`).join(' or ')})`,
    ]);
  }
  if (!Array.isArray(parsed.undiscovered)) {
    fail([`${source} must contain an undiscovered array`]);
  }
  if (new Set(parsed.undiscovered).size !== parsed.undiscovered.length) {
    fail([`${source} must not contain duplicate entries`]);
  }
  if (parsed.undiscovered.some((file) => typeof file !== 'string' || !CANDIDATE_TEST_FILE.test(file))) {
    fail([`${source} contains a path that is not a supported test-file suffix`]);
  }
  return parsed;
}

function parseStaticConfigExpression(source) {
  let index = 0;

  function reject(message) {
    throw new Error(`${message} at offset ${index}`);
  }

  function skipTrivia() {
    while (index < source.length) {
      if (/\s/.test(source[index])) {
        index += 1;
        continue;
      }
      if (source.startsWith('//', index)) {
        const newline = source.indexOf('\n', index + 2);
        index = newline === -1 ? source.length : newline + 1;
        continue;
      }
      if (source.startsWith('/*', index)) {
        const end = source.indexOf('*/', index + 2);
        if (end === -1) reject('unterminated block comment');
        index = end + 2;
        continue;
      }
      break;
    }
  }

  function parseString() {
    skipTrivia();
    const quote = source[index];
    if (quote !== "'" && quote !== '"') reject('expected a quoted string');
    index += 1;
    let value = '';
    while (index < source.length) {
      const character = source[index];
      if (character === quote) {
        index += 1;
        return value;
      }
      if (character === '\\') {
        reject('escaped strings are not allowed in the static Vitest contract');
      }
      if (character === '\n' || character === '\r') {
        reject('multiline strings are not allowed in the static Vitest contract');
      }
      value += character;
      index += 1;
    }
    reject('unterminated string');
  }

  function parseIdentifier() {
    skipTrivia();
    const match = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!match) reject('expected an identifier');
    index += match[0].length;
    return match[0];
  }

  function parseNumber() {
    skipTrivia();
    const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) reject('invalid numeric literal');
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) reject('numeric literal must be finite');
    return value;
  }

  function consume(character) {
    skipTrivia();
    if (source[index] !== character) reject(`expected '${character}'`);
    index += 1;
  }

  function parseArray() {
    consume('[');
    const values = [];
    skipTrivia();
    if (source[index] === ']') {
      index += 1;
      return values;
    }
    while (index < source.length) {
      values.push(parseValue());
      skipTrivia();
      if (source[index] === ']') {
        index += 1;
        return values;
      }
      consume(',');
      skipTrivia();
      if (source[index] === ']') {
        index += 1;
        return values;
      }
    }
    reject('unterminated array');
  }

  function parseObject() {
    consume('{');
    const value = Object.create(null);
    skipTrivia();
    if (source[index] === '}') {
      index += 1;
      return value;
    }
    while (index < source.length) {
      skipTrivia();
      const key = source[index] === "'" || source[index] === '"'
        ? parseString()
        : parseIdentifier();
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        reject(`unsafe property '${key}' is not allowed`);
      }
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        reject(`duplicate property '${key}' is not allowed`);
      }
      consume(':');
      value[key] = parseValue();
      skipTrivia();
      if (source[index] === '}') {
        index += 1;
        return value;
      }
      consume(',');
      skipTrivia();
      if (source[index] === '}') {
        index += 1;
        return value;
      }
    }
    reject('unterminated object');
  }

  function parseValue() {
    skipTrivia();
    const character = source[index];
    if (character === '{') return parseObject();
    if (character === '[') return parseArray();
    if (character === "'" || character === '"') return parseString();
    if (character === '-' || /[0-9]/.test(character || '')) return parseNumber();
    if (source.startsWith('true', index) && !/[A-Za-z0-9_$]/.test(source[index + 4] || '')) {
      index += 4;
      return true;
    }
    if (source.startsWith('false', index) && !/[A-Za-z0-9_$]/.test(source[index + 5] || '')) {
      index += 5;
      return false;
    }
    if (source.startsWith('null', index) && !/[A-Za-z0-9_$]/.test(source[index + 4] || '')) {
      index += 4;
      return null;
    }
    reject('only static literal values are allowed in the Vitest config');
  }

  const parsed = parseValue();
  skipTrivia();
  if (index !== source.length) {
    reject('unexpected executable or dynamic syntax after the static config');
  }
  return parsed;
}

function readEffectiveTestConfig() {
  const source = readFileSync(VITEST_CONFIG_PATH, 'utf8');
  const importPattern = /^\s*import\s+\{\s*defineConfig\s*\}\s+from\s+['"]vitest\/config['"]\s*;\s*/;
  const importMatch = source.match(importPattern);
  if (!importMatch) {
    fail([`${VITEST_CONFIG_PATH} must start with the canonical defineConfig import`]);
  }

  const remainder = source.slice(importMatch[0].length).trim();
  const prefix = 'export default defineConfig(';
  if (!remainder.startsWith(prefix) || !remainder.endsWith(');')) {
    fail([`${VITEST_CONFIG_PATH} must export one static defineConfig(...) expression`]);
  }

  const expression = remainder.slice(prefix.length, -2);
  let config;
  try {
    config = parseStaticConfigExpression(expression);
  } catch (error) {
    fail([
      `${VITEST_CONFIG_PATH} is outside the non-executing static configuration grammar`,
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const testConfig = config?.test;
  if (!testConfig || typeof testConfig !== 'object' || Array.isArray(testConfig)) {
    fail([`${VITEST_CONFIG_PATH} must define a static test object`]);
  }

  const include = testConfig.include;
  if (!Array.isArray(include) || include.length !== 1 || include[0] !== CURRENT_INCLUDE_PATTERN) {
    fail([`${VITEST_CONFIG_PATH} test.include must be exactly ['${CURRENT_INCLUDE_PATTERN}']`]);
  }

  if ('exclude' in testConfig) {
    const exclude = testConfig.exclude;
    if (!Array.isArray(exclude) || exclude.length !== 0) {
      fail([`${VITEST_CONFIG_PATH} test.exclude may not hide files from the discovery contract`]);
    }
  }

  return testConfig;
}

function isDefaultVitestTest(file) {
  return file.startsWith('src/')
    && (file.endsWith('.test.ts') || file.endsWith('.test.js'));
}

function readBaseBaseline(baseRef) {
  try {
    const text = execFileSync('git', ['show', `${baseRef}:${BASELINE_PATH}`], {
      encoding: 'utf8',
    });
    return parseBaseline(text, `${BASELINE_PATH} at base ${baseRef}`, {
      // The only approved bootstrap transition is the repository's existing
      // TypeScript-only contract to the canonical TypeScript + JavaScript one.
      // Candidate state itself is still required to use CURRENT_INCLUDE_PATTERN.
      allowedIncludePatterns: [CURRENT_INCLUDE_PATTERN, LEGACY_BASE_INCLUDE_PATTERN],
    });
  } catch (error) {
    fail([
      `could not read base discovery baseline at ${baseRef}; CI must fetch and retain TEST_DISCOVERY_BASE_SHA`,
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

if (!existsSync(BASELINE_PATH)) fail([`missing baseline file ${BASELINE_PATH}`]);
if (!existsSync(VITEST_CONFIG_PATH)) fail([`missing Vitest config ${VITEST_CONFIG_PATH}`]);

readEffectiveTestConfig();
const baseline = parseBaseline(readFileSync(BASELINE_PATH, 'utf8'), BASELINE_PATH);
const allTests = (await collectTestFiles('src')).sort();
const undiscovered = allTests.filter((file) => !isDefaultVitestTest(file));
const recorded = new Set(baseline.undiscovered);
const failures = [];
const baseRef = process.env.TEST_DISCOVERY_BASE_SHA?.trim();

if (baseRef && !/^0+$/.test(baseRef)) {
  const baseBaseline = readBaseBaseline(baseRef);
  const baseRecorded = new Set(baseBaseline.undiscovered);
  const introducedBaselineEntries = baseline.undiscovered.filter((file) => !baseRecorded.has(file));
  if (introducedBaselineEntries.length > 0) {
    failures.push(
      `baseline records test files absent from the base's recorded discovery debt: ${introducedBaselineEntries.join(', ')}`,
    );
  }
} else {
  console.log('Base debt comparison skipped locally; CI must set TEST_DISCOVERY_BASE_SHA.');
}

const stale = baseline.undiscovered.filter((file) => !undiscovered.includes(file)).sort();
if (stale.length > 0) {
  failures.push(
    `baseline still lists tests no longer excluded from default discovery: ${stale.join(', ')}. Remove paid-down entries from ${BASELINE_PATH}.`,
  );
}

const added = undiscovered.filter((file) => !recorded.has(file));
if (added.length > 0) {
  failures.push(
    `new tests are excluded from default npm test discovery: ${added.join(', ')}. Rename or move them into the approved .test.ts/.test.js contract, or repair the discovery contract in a separately reviewed change.`,
  );
}

console.log(`Candidate test files under src/: ${allTests.length}`);
console.log(`  matched by default npm test discovery: ${allTests.length - undiscovered.length}`);
console.log(`  excluded from default npm test discovery: ${undiscovered.length}`);

if (failures.length > 0) fail(failures);

console.log(`\nTest discovery ratchet holding at ${undiscovered.length} known default-excluded file(s).`);
console.log('No new default-excluded test files were introduced.');
