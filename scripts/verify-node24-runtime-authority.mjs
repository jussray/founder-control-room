#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_NODE_MAJOR = '24';
const WORKFLOW_DIR = path.join(process.cwd(), '.github', 'workflows');
const errors = [];

const authority = (await readFile(path.join(process.cwd(), '.node-version'), 'utf8')).trim();
if (authority !== REQUIRED_NODE_MAJOR) {
  errors.push(`.node-version must be ${REQUIRED_NODE_MAJOR}; found ${authority || 'empty'}`);
}

const workflowFiles = (await readdir(WORKFLOW_DIR))
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort();

for (const file of workflowFiles) {
  const source = await readFile(path.join(WORKFLOW_DIR, file), 'utf8');
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (!/uses:\s*actions\/setup-node@/.test(lines[index])) continue;

    const block = lines.slice(index, index + 12).join('\n');
    const explicit = block.match(/node-version:\s*['"]?([^'"\s#]+)/);
    const versionFile = block.match(/node-version-file:\s*['"]?([^'"\s#]+)/);

    if (explicit) {
      const value = explicit[1];
      if (value !== REQUIRED_NODE_MAJOR && value !== `${REQUIRED_NODE_MAJOR}.x`) {
        errors.push(`${file}:${index + 1} setup-node must use Node ${REQUIRED_NODE_MAJOR}; found ${value}`);
      }
      continue;
    }

    if (versionFile) {
      if (versionFile[1] !== '.node-version') {
        errors.push(`${file}:${index + 1} setup-node must reference .node-version; found ${versionFile[1]}`);
      }
      continue;
    }

    errors.push(`${file}:${index + 1} setup-node must declare node-version: ${REQUIRED_NODE_MAJOR} or node-version-file: .node-version`);
  }
}

if (errors.length > 0) {
  console.error('Node 24 runtime authority check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Node ${REQUIRED_NODE_MAJOR} runtime authority verified across ${workflowFiles.length} workflow files.`);
