import { access, readFile } from 'node:fs/promises';
import { capabilities } from '../public/control-room/capability-registry.js';

const required = [
  'public/control-room/capabilities.html',
  'public/control-room/capabilities.css',
  'public/control-room/capabilities.js',
  'public/control-room/capability-registry.js',
];

await Promise.all(required.map(file => access(new URL(`../${file}`, import.meta.url))));

const ids = capabilities.map(item => item.id);
if (new Set(ids).size !== ids.length) throw new Error('Capability IDs must be unique');
for (const capability of capabilities) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/.test(capability.id)) throw new Error(`Invalid capability ID: ${capability.id}`);
  if (!capability.proof?.length || !capability.risk || !capability.implementation) throw new Error(`Incomplete capability contract: ${capability.id}`);
}

const app = await readFile(new URL('../public/control-room/capabilities.js', import.meta.url), 'utf8');
for (const boundary of ['fcr_session', 'Copy only. No action runs from this screen.', 'replaceAll']) {
  if (!app.includes(boundary)) throw new Error(`Missing workbench boundary: ${boundary}`);
}

console.log(`Capability workbench verified: ${capabilities.length} reviewed entries`);
