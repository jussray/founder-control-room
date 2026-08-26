#!/usr/bin/env node
/**
 * Test discovery ratchet.
 *
 * The default Vitest configuration currently runs TypeScript .test.ts files
 * under src/. Candidate test files outside that configured include remain
 * excluded from the default npm test gate. They can still be run by a
 * dedicated workflow, so this verifier never calls them "never run in CI"
 * without an exact workflow receipt.
 *
 * The recorded debt is base-bound: a pull request may remove entries by
 * making a candidate discoverable or deleting it, but it cannot add a newly
 * excluded test to its own baseline.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { posix } from 'node:path';

const BASELINE_PATH = 'scripts/test-discovery-baseline.json';
const VITEST_CONFIG_PATH = 'vitest.config.ts';
const CURRENT_INCLUDE_PATTERN = 'src/**/*.test.ts';
const LEGACY_INCLUDE_PATTERN = 'src/**/__tests__/**/*.test.ts';
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

function isDefaultVitestTest(file, includePattern) {
  if (includePattern === CURRENT_INCLUDE_PATTERN) {
    return file.startsWith('src/') && file.endsWith('.test.ts');
  }
  if (includePattern === LEGACY_INCLUDE_PATTERN) {
    return file.startsWith('src/')
      && file.split('/').includes('__tests__')
      && file.endsWith('.test.ts');
  }
  fail([
    `unsupported Vitest include pattern '${includePattern}'. Update this verifier and ${BASELINE_PATH} together.`,
  ]);
}

function stripComments(source) {
  let output = '';
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        output += char;
      } else {
        output += ' ';
      }
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        blockComment = false;
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      output += char;
      continue;
    }
    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      blockComment = true;
      continue;
    }
    output += char;
  }
  return output;
}

function matchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function topLevelSegments(objectBody) {
  const segments = [];
  let start = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < objectBody.length; index += 1) {
    const char = objectBody[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth -= 1;
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth -= 1;
    else if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth -= 1;
    else if (char === ',' && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      segments.push(objectBody.slice(start, index).trim());
      start = index + 1;
    }
  }
  segments.push(objectBody.slice(start).trim());
  return segments.filter(Boolean);
}

function effectiveDiscoveryConfig(source, label) {
  const clean = stripComments(source);
  const testMatch = /\btest\s*:\s*\{/.exec(clean);
  if (!testMatch) fail([`${label} does not contain a statically inspectable test object`]);
  const openIndex = clean.indexOf('{', testMatch.index);
  const closeIndex = matchingBrace(clean, openIndex);
  if (closeIndex < 0) fail([`${label} contains an unterminated test object`]);

  const segments = topLevelSegments(clean.slice(openIndex + 1, closeIndex));
  const includeSegments = segments.filter((segment) => /^include\s*:/.test(segment));
  const excludeSegments = segments.filter((segment) => /^exclude\s*:/.test(segment));
  if (includeSegments.length !== 1) {
    fail([`${label} must contain exactly one top-level test.include declaration`]);
  }
  if (excludeSegments.length > 0) {
    fail([`${label} contains top-level test.exclude, which this verifier does not model; fail closed rather than overclaim discovery`]);
  }

  const includeMatch = /^include\s*:\s*\[\s*(['"])([^'"]+)\1\s*\]\s*$/.exec(includeSegments[0]);
  if (!includeMatch) {
    fail([`${label} test.include must be a single static string so discovery can be verified fail-closed`]);
  }
  const includePattern = includeMatch[2];
  if (includePattern !== CURRENT_INCLUDE_PATTERN && includePattern !== LEGACY_INCLUDE_PATTERN) {
    fail([`unsupported Vitest include pattern '${includePattern}' in ${label}. Update this verifier and ${BASELINE_PATH} together.`]);
  }
  return { includePattern };
}

function readBaseFile(baseRef, path) {
  try {
    return execFileSync('git', ['show', `${baseRef}:${path}`], { encoding: 'utf8' });
  } catch (error) {
    fail([
      `could not read ${path} at base ${baseRef}; CI must fetch and retain TEST_DISCOVERY_BASE_SHA`,
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function baseUndiscoveredTests(baseRef, includePattern) {
  try {
    return execFileSync('git', ['ls-tree', '-r', '--name-only', baseRef, '--', 'src'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .filter((file) => CANDIDATE_TEST_FILE.test(file))
      .filter((file) => !isDefaultVitestTest(file, includePattern));
  } catch (error) {
    fail([
      `could not read base test inventory at ${baseRef}; CI must fetch and retain TEST_DISCOVERY_BASE_SHA`,
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

if (!existsSync(BASELINE_PATH)) {
  fail([`missing baseline file ${BASELINE_PATH}`]);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const baselineEntries = baseline.undiscovered;
if (!Array.isArray(baselineEntries)) {
  fail([`${BASELINE_PATH} must contain an undiscovered array`]);
}
if (new Set(baselineEntries).size !== baselineEntries.length) {
  fail([`${BASELINE_PATH} must not contain duplicate entries`]);
}
if (baselineEntries.some((file) => typeof file !== 'string' || !CANDIDATE_TEST_FILE.test(file))) {
  fail([`${BASELINE_PATH} contains a path that is not a supported test-file suffix`]);
}

const configuredIncludePattern = baseline.includePattern;
const candidateConfig = effectiveDiscoveryConfig(readFileSync(VITEST_CONFIG_PATH, 'utf8'), VITEST_CONFIG_PATH);
if (typeof configuredIncludePattern !== 'string' || configuredIncludePattern !== candidateConfig.includePattern) {
  fail([
    `${BASELINE_PATH} includePattern must exactly match the effective top-level test.include in ${VITEST_CONFIG_PATH}`,
  ]);
}
const includePattern = candidateConfig.includePattern;

const allTests = (await collectTestFiles('src')).sort();
const undiscovered = allTests.filter((file) => !isDefaultVitestTest(file, includePattern));
const recorded = new Set(baselineEntries);
const failures = [];
const baseRef = process.env.TEST_DISCOVERY_BASE_SHA?.trim();

if (baseRef && !/^0+$/.test(baseRef)) {
  const baseConfig = effectiveDiscoveryConfig(
    readBaseFile(baseRef, VITEST_CONFIG_PATH),
    `${VITEST_CONFIG_PATH}@${baseRef}`,
  );
  const baseUndiscovered = new Set(baseUndiscoveredTests(baseRef, baseConfig.includePattern));
  const introducedBaselineEntries = baselineEntries.filter((file) => !baseUndiscovered.has(file));
  if (introducedBaselineEntries.length > 0) {
    failures.push(
      `baseline records test files absent from the base's default-discovery debt: ${introducedBaselineEntries.join(', ')}`,
    );
  }
  if (includePattern !== baseConfig.includePattern) {
    failures.push(
      `candidate changes default test.include from base '${baseConfig.includePattern}' to '${includePattern}'. Discovery-contract migrations require a dedicated reviewed change and cannot redefine base debt.`,
    );
  }
} else {
  console.log('Base debt comparison skipped locally; CI must set TEST_DISCOVERY_BASE_SHA.');
}

const stale = baselineEntries.filter((file) => !undiscovered.includes(file)).sort();
if (stale.length > 0) {
  failures.push(
    `baseline still lists tests no longer excluded from default discovery: ${stale.join(', ')}. Remove paid-down entries from ${BASELINE_PATH}.`,
  );
}

const added = undiscovered.filter((file) => !recorded.has(file));
if (added.length > 0) {
  failures.push(
    `new tests are excluded from default npm test discovery: ${added.join(', ')}. Move them into the effective default include or record pre-existing base debt only.`,
  );
}

console.log(`Candidate test files under src/: ${allTests.length}`);
console.log(`  matched by default npm test discovery: ${allTests.length - undiscovered.length}`);
console.log(`  excluded from default npm test discovery: ${undiscovered.length}`);

if (failures.length > 0) fail(failures);

console.log(`\nTest discovery ratchet holding at ${undiscovered.length} known default-excluded file(s).`);
console.log('No new default-excluded test files were introduced.');
